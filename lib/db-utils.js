
"use strict";

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
/*	new Promise((resolve, reject) => {
		opts.db.collection('summoners', { strict: true }, (error, collection) => {
			if(error)
				return reject(error);
			resolve(collection);
		});
	});*/
}

module.exports.getChampionsCollection = getChampionsCollection;
module.exports.getSummonersCollection = getSummonersCollection;

