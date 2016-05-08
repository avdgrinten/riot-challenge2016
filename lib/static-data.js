
"use strict";

const request = require('request');

const riotApi = require('./riot-api.js');

function cacheData(opts) {
	let cacheVersions = () => {
		return opts.versionsCollection.remove()
		.then(() => Promise.all(Object.keys(riotApi.platforms).map(platform_id => {
			return new Promise((resolve, reject) => {
				request({
					url: riotApi.buildUrl({
						apiKey: opts.apiKey,
						platform: platform_id,
						endpoint: '/api/lol/static-data/{region}/v1.2/realm',
						global: true
					}),
					json: true
				}, (error, res, body) => {
					if(error)
						return reject(error);
					
					if(res.statusCode == 200) {
						resolve(body);
					}else{
						reject(new Error('Retrieving static-data API failed with status '
								+ res.statusCode));
					}
				});
			})
			.then(body => {
				return opts.versionsCollection.insertOne({
					platformId:  platform_id,
					ddragonVersion: body.dd
				});
			});
		})));
	};

	let cacheChampions = () => {
		return opts.championsCollection.remove()
		.then(() => new Promise((resolve, reject) => {
			request({
				url: riotApi.buildUrl({
					apiKey: opts.apiKey,
					platform: 'EUW1',
					endpoint: '/api/lol/static-data/{region}/v1.2/champion',
					global: true
				}),
				json: true
			}, (error, res, body) => {
				if(error)
					return reject(error);
				
				if(res.statusCode == 200) {
					resolve(body);
				}else{
					reject(new Error('Retrieving static-data API failed with status '
							+ res.statusCode));
				}
			});
		}))
		.then(body => {
			return Promise.all(Object.keys(body.data).map(key => {
				return opts.championsCollection.insertOne({
					id: body.data[key].id,
					key: key,
					name: body.data[key].name
				});
			}));
		});
	};

	return cacheVersions()
	.then(() => cacheChampions());
}

class StaticCache {
	constructor(opts) {
		this._versionsMap = { };

		this._championsList = [ ];
		this._championsMap = { };

		this._versions = opts.versionsCollection;
		this._champions = opts.championsCollection;
	}

	initialize() {
		let loadVersions = () => {
			return this._versions.find().toArray()
			.then(array => {
				array.forEach(entry => {
					this._versionsMap[entry.platformId] = entry.ddragonVersion;
				});
			});
		};

		let loadChampions = () => {
			return this._champions.find().toArray()
			.then(array => {
				array.forEach(entry => {
					let champion = {
						id: entry.id,
						key: entry.key,
						name: entry.name
					};

					this._championsList.push(champion);
					this._championsMap[entry.id] = champion;
				});
			});
		};

		return loadVersions()
		.then(() => loadChampions());
	}

	versionOf(platform_id) {
		return this._versionsMap[platform_id];
	}

	allChampions() {
		return this._championsList;
	}
	getChampion(id) {
		return this._championsMap[id];
	}

	profileIconUrl(summoner) {
		return 'http://ddragon.leagueoflegends.com'
				+ '/cdn/' + this.versionOf(summoner.platformId) + '/img/profileicon/'
				+ summoner.profileIcon + '.png';
	}
};

module.exports.cacheData = cacheData;
module.exports.StaticCache = StaticCache;

