
"use strict";

const assert = require('assert');
const request = require('request');
const mongodb = require('mongodb');

const jsUtils = require('./js-utils.js');
const riotApi = require('./riot-api.js');
const questionPool = require('./questions.js');

let BaseCrawler = class {
	constructor(opts) {
		this._platformId = opts.platformId;
		this._apiKey = opts.apiKey;
		this._queue = opts.queue;

		// database collections we need to query
		this._summoners = opts.summonersCollection;
	}

	_updateMasteries(summoner_id) {
		return new Promise((resolve, reject) => {
			this._queue.enqueue(() => {
				request({
					url: riotApi.buildUrl({
						apiKey: this._apiKey,
						platform: this._platformId,
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
				platformId: this._platformId,
				summonerId: summoner_id
			}, {
				$set: {
					masteries: masteries,
					applicableQuestions: questionPool.filter(entry => {
						return entry.builder.applicable({
							// unfortunately we have to duplicate the data here
							platformId: this._platformId,
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
	getSummonerByName(summoner_name) {
		return new Promise((resolve, reject) => {
			request({
				url: riotApi.buildUrl({
					apiKey: this._apiKey,
					platform: this._platformId,
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
					let entry = body[key];
					resolve({
						platformId: this._platformId,
						summonerId: entry.id,
						displayName: entry.name,
						profileIcon: entry.profileIconId
					});
				}
			});
		})
		.then(summoner => {
			if(summoner)
				return this._updateMasteries(summoner.summonerId)
				.then(() => summoner);
		})
	}
};

let BackgroundCrawler = class extends BaseCrawler {
	constructor(opts) {
		super(opts);

		this._logger = opts.logger;

		this._summonersGoal = opts.summonersGoal || 2000;
	}

	initialize() {
		return this._ensureSomeSummoners()
		.then(() => this._ensureEnoughApplicable());
	}

	run() {
		this._crawlSome()
		.catch(error => {
			this._logger.error("Error while crawling for " + this._platformId);
			this._logger.error(error);
		})
		.then(() => {
			this.run();
		});
	}

	_ensureSomeSummoners() {
		// make sure there is enough base data to work from
		return this._summoners.count({ platformId: this._platformId })
		.then(count => {
			if(count > 0)
				return;
			
			console.log("No summoner data for " + this._platformId + "."
					+ " Gathering initial data.");
		
			return this._seedSummonerPool()
			.catch(error => {
				console.error({ err: error },
						"Error while gathering data for " + this._platformId + "."
						+ " Retrying.");
			})
			.then(() => this._ensureSomeSummoners());
		});
	}

	_ensureEnoughApplicable() {
		return this._summoners.count({
			'applicableQuestions.0': { $exists: true }
		})
		.then(applicable_count => {
			if(applicable_count > 100)
				return;

			// make sure there is enough base data to work from
			return this._crawlSome()
			.catch(error => {
				console.error("Error while gathering data on " + this._platformId + "."
						+ " Retrying.");
				console.error(error);
			})
			.then(() => this._ensureSomeSummoners());
		});
	}

	_seedSummonerPool() {
		return this._summoners.find({ platformId: this._platformId }).toArray()
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
				let ids = body.entries.map(entry => entry.playerOrTeamId);

				return Promise.all(ids.map(id => {
					return this._summoners.updateOne({
						platformId: this._platformId,
						summonerId: id
					}, {
						$currentDate: { crawlDate: true }
					}, { upsert: true });
				}));
			})
		});
	}

	_crawlSome() {
		return this._summoners.count({
			platformId: this._platformId,
		})
		.then(count => {
			if(count < this._summonersGoal) {
				return this._summoners.find({
					platformId: this._platformId,
					masteries: { $exists: false }
				}).limit(10).toArray()
				.then(array => {
					if(array.length > 0) {
						this._logger.info({
							platformId: this._platformId
						}, "Importing mastery data");

						return Promise.all(array.map(summoner => {
							return this._updateMasteries(summoner.summonerId);
						}));
					}else{
						this._logger.info({
							platformId: this._platformId
						}, "Expanding summoner pool");

						return this._expandSummonerPool();
					}
				});
			}else {
				this._logger.info({
					platformId: this._platformId
				}, "Purging summoner pool");

				return this._purgeSummonerPool();
			}
		});
	}

	_expandSummonerPool() {
		return this._summoners.aggregate([
			{ $match: { platformId: this._platformId } },
			{ $sample: { size: 1 } }
		]).toArray()
		.then(array => {
			assert(array.length == 1);
			return new Promise((resolve, reject) => this._queue.enqueue(() => {
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
			}))
			.then(body => {
				let ids = body.games.reduce((ids, game) => {
					return ids.concat(game.fellowPlayers.map(player => {
						return player.summonerId
					}));
				}, [ ]);

				return Promise.all(ids.map(id => {
					return this._summoners.updateOne({
						platformId: this._platformId,
						summonerId: id
					}, {
						$currentDate: { crawlDate: true }
					}, { upsert: true });
				}));
			})
		})
	}

	_purgeSummonerPool() {
		return this._summoners.remove({
			platformId: this._platformId,
			'applicableQuestions.0': { $exists: false },
			masteries: { $exists: true }
		})
		.then(() => this._summoners.count({
			platformId: this._platformId,
		}))
		.then(count => {
			if(count < this._summonersGoal)
				return;

			return this._summoners.aggregate([
				{ $match: { platformId: this._platformId } },
				{ $sample: { size: 100 } }
			]).toArray()
			.then(array => {
				return this._summoners.remove({
					_id: { $in: array.map(summoner => summoner._id) }
				});
			});
		});
	}
};

let Sampler = class {
	constructor(opts) {
		this._questionId = opts.questionId;

		this._dataStack = [ ];
		this._waitQueue = [ ];

		this._queryId = null;
		this._queryPending = false;
		
		// database collections we need to query
		this._summoners = opts.summonersCollection;
	}

	initialize() {
		return this._summoners.aggregate([
			{ $sample: { size: 1 } }
		]).toArray()
		.then(array => {
			assert(array.length > 0);
			this._queryId = array[0]._id;
		});
	}

	sampleRandomSummoner() {
		if(this._dataStack.length > 0) {
			let data = this._dataStack.pop();
			return Promise.resolve(data);
		}

		return new Promise((resolve, reject) => {
			this._waitQueue.push(resolve);
			this._initiateQuery();
		});
	}

	_initiateQuery() {
		if(this._queryPending)
			return;
		
		this._queryPending = true;

		this._doQuery().then(() => {
			this._queryPending = false;
		})
		.catch(error => {
			console.error("Could not sample summoner data");
			console.error(error);
			console.error(error.stack);
		});
	}

	_doQuery() {
		let expected = 1;

		return this._summoners.find({
			_id: { $gt: this._queryId },
			applicableQuestions: this._questionId
		}).sort({ _id: 1 }).limit(expected).toArray()
		.then(array => {
			jsUtils.shuffleInPlace(array);

			// restart from the beginning as soon as we reach the end
			if(array.length < expected) {
				this._queryId = new mongodb.MinKey();
			}else{
				this._queryId = array[array.length - 1]._id;
			}

			if(array.length == 0)
				return this._doQuery();

			// satisfy as many waiting requests as possible
			// cache the remaining items for later use
			let k = Math.min(this._waitQueue.length, array.length);

			for(let i = 0; i < k; i++)
				this._waitQueue[i](array[i]);
			for(let i = k; i < array.length; i++)
				this._dataStack.push(array[i]);

			this._waitQueue.splice(0, array.length);

			// check if we satisfied all requests
			if(this._waitQueue.length > 0)
				return this._doQuery();
		});
	}
}

module.exports.RealtimeCrawler = RealtimeCrawler;
module.exports.BackgroundCrawler = BackgroundCrawler;
module.exports.Sampler = Sampler;

