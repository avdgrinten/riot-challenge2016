
"use strict";

const request = require('request');

const riotApi = require('./riot-api.js');

let importMasteries = function(platform, summoner_id, opts) {
	let masteries;

	return new Promise((resolve, reject) => {
		opts.db.collection("masteries", { strict: true }, (error, collection) => {
			if(error)
				return reject(error);

			masteries = collection;
			resolve()
		});
	})
	.then(() => new Promise((resolve, reject) => {
		request({
			url: riotApi.buildUrl({
				apiKey: opts.apiKey,
				platform: platform,
				endpoint: '/championmastery/location/{platformId}/player/{playerId}/champions',
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
	}))
	.then(data => masteries.insertOne({
		platform: platform,
		summonerId: summoner_id,
		masteries: data.map(entry => {
			return {
				championId: entry.championId,
				points: entry.championPoints,
				level: entry.championLevel,
				lastPlayTime: entry.lastPlayTime,
				highestGrade: entry.highestGrade,
				chestGranted: entry.chestGranted
			};
		})
	}));
}

module.exports.importMasteries = importMasteries;

