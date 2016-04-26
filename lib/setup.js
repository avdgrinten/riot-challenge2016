
"use strict";

const assert = require('assert');
const request = require('request');

const riotApi = require('./riot-api.js');

let createCollections = function(opts) {
	return Promise.all([
		opts.db.createCollection("champions"),
		opts.db.createCollection("masteries")
	]);
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

