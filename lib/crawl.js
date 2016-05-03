
"use strict";

const request = require('request');

const riotApi = require('./riot-api.js');
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
		return new Promise((resolve, reject) => {
			this._db.collection('summoners', { strict: true }, (error, collection) => {
				if(error)
					return reject(error);

				this._summoners = collection;
				resolve()
			});
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

module.exports.RealtimeCrawler = RealtimeCrawler;

