
"use strict";

function getVersionsCollection(opts) {
	return opts.db.createCollection('versions')
}

function getChampionsCollection(opts) {
	return opts.db.createCollection('champions')
}

function getSummonersCollection(opts) {
	return opts.db.createCollection('summoners')
	.then(collection => {
		return collection.createIndex({
			'platformId' : 1,
			'summonerId' : 1
		}, { unique: true })
		.then(() => collection.createIndex({
			'applicableQuestions' : 1
		}))
		.then(() => {
			return collection;
		});
	});
}

module.exports.getVersionsCollection = getVersionsCollection;
module.exports.getChampionsCollection = getChampionsCollection;
module.exports.getSummonersCollection = getSummonersCollection;

