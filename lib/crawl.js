
"use strict";

const assert = require('assert');
const request = require('request');

const riotApi = require('./riot-api.js');
const dbUtils = require('./db-utils.js');
const questionPool = require('./questions.js');

let BaseCrawler = class {
	constructor(opts) {
		this._platformId = opts.platformId;
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
						reject(new Error('Retrieving championmastery API failed with status '
								+ res.statusCode));
					}
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
	initialize() {
		return super.initialize()
		.then(() => this._ensureEnoughData())
	}

	run() {
		let num_imported = 0;

		this._summoners.aggregate([
			{ $match: { platform: this._platformId } },
			{ $sample: { size: 1 } }
		]).toArray()
		.then(array => {
			return new Promise((resolve, reject) => {
				assert(array.length == 1);

				this._queue.enqueue(() => {
					request({
						url: riotApi.buildUrl({
							apiKey: this._apiKey,
							platform: this._platformId,
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

						if(res.statusCode == 200) {
							resolve(body);
						}else{
							reject(new Error('Retrieving game API failed with status '
									+ res.statusCode));
						}
					});
				});
			})
			.then(body => {
				// use reduce here to process the requests sequentially
				return body.games.reduce((p, game) => p.then(() => {
					return game.fellowPlayers.reduce((p, player) => p.then(() => {
						return this.updateMasteries(this._platformId, player.summonerId)
						.then(() => {
							num_imported++;
						});
					}), Promise.resolve());
				}), Promise.resolve());
			})
		})
		.then(() => {
			console.log("Imported " + num_imported + " summoners"
					+ " from platform " + this._platformId);
		})
		.catch(error => {
			console.error("Error while crawling");
			console.error(error);
		})
		.then(() => {
			this.run();
		});
	}

	_ensureEnoughData() {
		return this._summoners.count({ platform: this._platformId })
		.then(count => {
			if(count > 100)
				return;

			console.log("Not enough summoner data for platform " + this._platformId + "."
					+ " Importing challenger tier.");

			return this._summoners.find({ platform: this._platformId }).toArray()
			.then(array => {
				return new Promise((resolve, reject) => this._queue.enqueue(() => {
					request({
						url: riotApi.buildUrl({
							apiKey: this._apiKey,
							platform: this._platformId,
							endpoint: '/api/lol/{region}/v2.5/league/challenger',
							query: {
								type: 'RANKED_SOLO_5x5'
							}
						}),
						json: true
					}, (error, res, body) => {
						if(error)
							return reject(error);

						if(res.statusCode == 200) {
							resolve(body);
						}else{
							reject(new Error("Retrieving league API failed with status "
									+ res.statusCode));
						}
					});
				}))
				.then(body => {
					// import only summoners that are not in the DB yet
					let ids = body.entries.map(entry => entry.playerOrTeamId)
					.filter(id => {
						return !array.find(summoner => summoner.summonerId == id);
					});

					// use reduce here to process the requests sequentially
					return ids.reduce((p, id) => p.then(() => {
						return this.updateMasteries(this._platformId, id);
					}), Promise.resolve());
				})
				.then(() => {
					console.log("Imported challenger tier of " + this._platformId);
				})
				.catch(error => {
					console.error("Error while importing challenger tier of "
							+ this._platformId + ". Retrying.");
					console.error(error);

					this._ensureEnoughData();
				});
			});
		});
	}
};

module.exports.RealtimeCrawler = RealtimeCrawler;
module.exports.BackgroundCrawler = BackgroundCrawler;

