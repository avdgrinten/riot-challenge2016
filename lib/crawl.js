
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

					if(res.statusCode == 200) {
						resolve(body);
					}else{
						console.log('Crawling request failed with status ' + res.statusCode);
					}
				});
			});
		})
		.then(data => {
			if(!data)
				return;

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
	getSummonerByName(platform_id, summoner_name) {
		return new Promise((resolve, reject) => {
			request({
				url: riotApi.buildUrl({
					apiKey: this._apiKey,
					platform: platform_id,
					endpoint: '/api/lol/{region}/v1.4/summoner/by-name/{summonerNames}',
					args: {
						summonerNames: summoner_name
					}
				}),
				json: true
			}, (error, res, body) => {
				if(error)
					return reject(error);

				let key = summoner_name.toLowerCase().replace(/ /g, '');
				if(!(key in body)) {
					resolve(null);
				}else{
					var entry = body[key];
					resolve({
						summonerId: entry.id,
						displayName: entry.name,
						profileIcon: entry.profileIconId
					});
				}
			});
		})
		.then(summoner => {
			if(summoner)
				return this.updateMasteries(platform_id, summoner.summonerId)
				.then(() => summoner);
		})
	}

	sampleRandomMasteries(question_id) {
		return this._summoners.aggregate([
			{ $match: { applicableQuestions: question_id } },
			{ $sample: { size: 1 } }
		]).toArray();
	}
};

let BackgroundCrawler = class extends BaseCrawler {
	run() {
		this._summoners.aggregate([
			{ $sample: { size: 1 } }
		]).toArray()
		.then(array => {
			return new Promise((resolve, reject) => {
				assert(array.length == 1);

				this._queue.enqueue(() => {
					request({
						url: riotApi.buildUrl({
							apiKey: this._apiKey,
							platform: array[0].platform,
							endpoint: '/api/lol/{region}/v1.3/game'
									+ '/by-summoner/{summonerId}/recent',
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
			})
			.then(body => {
				return body.games.reduce((promise, game) => promise.then(() => {
					return game.fellowPlayers.reduce((promise, player) => promise.then(() => {
						console.log("Crawling " + player.summonerId
								+ " on " + array[0].platform);

						return this.updateMasteries(array[0].platform,
								player.summonerId);
					}), Promise.resolve());
				}), Promise.resolve());
			})
		})
		.then(() => {
			console.log("Crawling complete");
		})
		.catch(error => {
			console.log("Error while crawling");
			console.log(error);
			console.log(error.stack);
		});
	}
};

module.exports.RealtimeCrawler = RealtimeCrawler;
module.exports.BackgroundCrawler = BackgroundCrawler;

