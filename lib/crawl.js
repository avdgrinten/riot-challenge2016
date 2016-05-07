
"use strict";

const assert = require('assert');
const request = require('request');

const riotApi = require('./riot-api.js');
const dbUtils = require('./db-utils.js');
const questionPool = require('./questions.js');

let BaseCrawler = class {
	constructor(opts) {
		this._apiKey = opts.apiKey;
		this._queue = opts.queue;

		// database collections we need to query
		this._db = opts.db;
		this._summoners = null;
	}

	initialize() {
		return dbUtils.getSummonersCollection({ db: this._db })
		.then(collection => {
			this._summoners = collection;
		});
	}

	updateMasteries(platform, summoner_id) {
		return new Promise((resolve, reject) => {
			this._queue.enqueue(() => {
				request({
					url: riotApi.buildUrl({
						apiKey: this._apiKey,
						platform: platform,
						endpoint: '/championmastery/location/{platformId}'
								+ '/player/{playerId}/champions',
						args: {
							playerId: summoner_id
						}
					}),
					json: true
				}, (error, res, body) => {
					if(error)
						return reject(error);

					resolve(body);
				});
			});
		})
		.then(data => {
			// for debugging purposes
			if(!data.map)
				console.log(data);

			let masteries = data.map(entry => {
				return {
					championId: entry.championId,
					points: entry.championPoints,
					level: entry.championLevel,
					lastPlayTime: entry.lastPlayTime,
					highestGrade: entry.highestGrade,
					chestGranted: entry.chestGranted
				};
			});

			return this._summoners.updateOne({
				platform: platform,
				summonerId: summoner_id
			}, {
				$set: {
					masteries: masteries,
					applicableQuestions: questionPool.filter(entry => {
						return entry.builder.applicable({
							// unfortunately we have to duplicate the data here
							platform: platform,
							summonerId: summoner_id,
							masteries: masteries
						});
					}).map(entry => entry.id)
				},
				$currentDate: { 'masteriesTime': true }
			}, { upsert: true });
		});
	}
};

let RealtimeCrawler = class extends BaseCrawler {

};

let BackgroundCrawler = class extends BaseCrawler {
	run() {
		this._summoners.aggregate([
			{ $sample: { size: 1 } }
		]).toArray()
		.then(array => new Promise((resolve, reject) => {
			assert(array.length == 1);

			this._queue.enqueue(() => {
				request({
					url: riotApi.buildUrl({
						apiKey: this._apiKey,
						platform: array[0].platform,
						endpoint: '/api/lol/{region}/v2.2/matchlist'
								+ '/by-summoner/{summonerId}',
						args: {
							summonerId: array[0].summonerId
						}
					}),
					json: true
				}, (error, res, body) => {
					if(error)
						return reject(error);

					resolve(body);
				});
			});
		}))
		.then(body => {
			return body.matches.reduce((promise, match) => {
				return promise.then(() => this._importMatch(match.platformId, match.matchId));
			}, Promise.resolve());
		})
		.catch(error => {
			console.log("Error while crawling");
			console.log(error);
			console.log(error.stack);
		});
	}

	_importMatch(platform_id, match_id) {
		return new Promise((resolve, reject) => {
			this._queue.enqueue(() => {
				request({
					url: riotApi.buildUrl({
						apiKey: this._apiKey,
						platform: platform_id,
						endpoint: '/api/lol/{region}/v2.2/match/{matchId}',
						args: {
							matchId: match_id
						}
					}),
					json: true
				}, (error, res, body) => {
					if(error)
						return reject(error);

					resolve(body);
				});
			});
		})
		.then(body => {
			return body.participantIdentities.reduce((promise, identity) => {
				return promise.then(() => {
					console.log("Crawling " + identity.player.summonerId
							+ " on " + body.platformId);
				
					return this.updateMasteries(body.platformId, identity.player.summonerId);
				});
			}, Promise.resolve());
		});
	}
};

module.exports.RealtimeCrawler = RealtimeCrawler;
module.exports.BackgroundCrawler = BackgroundCrawler;

