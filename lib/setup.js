
"use strict";

const assert = require('assert');
const request = require('request');

let platforms = {
	'EUW1': {
		region: 'euw',
		host: 'euw.api.pvp.net'
	}
};

let riotApiUrl = function(opts) {
	assert(opts.apiKey);
	assert(opts.platform);
	assert(opts.endpoint);

	let platform = platforms[opts.platform];
	if(!platform)
		throw new Error("Unexpected platform");

	let host = opts.global ? 'global.api.pvp.net' : platform.host;

	let path = opts.endpoint.replace(/\{(\w+)\}/, (match, variable) => {
		if(variable == 'platformId') {
			return opts.platform;
		}else if(variable == 'region') {
			return platform.region;
		}else{
			if(!opts.args ||!(variable in opts.args))
				throw new Error("Expected URL argument '" + variable + "'");
			return opts.args[variable];
		}
	});

	return 'https://' + host + path + '?api_key=' + opts.apiKey;
};

let createCollections = function(opts) {
	return opts.db.createCollection("champions")
	.then(() => null);
};

let cacheChampions = function(opts) {
	let champions;

	return new Promise((resolve, reject) => {
		opts.db.collection("champions", { strict: true }, (error, collection) => {
			if(error)
				return reject(error);

			champions = collection;
			resolve()
		});
	})
	.then(() => champions.remove())
	.then(() => new Promise((resolve, reject) => {
		request({
			url: riotApiUrl({
				apiKey: opts.apiKey,
				platform: 'EUW1',
				endpoint: '/api/lol/static-data/{region}/v1.2/champion',
				global: true
			}),
			json: true
		}, (error, res, body) => {
			if(error)
				return reject(error);
			
			resolve(body.data);
		});
	}))
	.then(data => Promise.all(Object.keys(data).map(key => {
		let entry = data[key];
		return champions.insertOne({
			id: entry.id,
			key: key,
			name: entry.name
		});
	})));
};

module.exports.createCollections = createCollections;
module.exports.cacheChampions = cacheChampions;

