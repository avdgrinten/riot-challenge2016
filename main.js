#!/usr/bin/env node

"use strict";

const assert = require('assert');
const fs = require('fs');
const minimist = require('minimist');
const mongodb = require('mongodb');

const setup = require('./lib/setup.js');
const crawl = require('./lib/crawl.js');
const gameLogic = require('./lib/game-logic.js');
const expressServer = require('./lib/express-server.js');

let config;
let db;
let logic;

let readConfig = function() {
	return new Promise((resolve, reject) => {
		var source = fs.readFileSync("./config.json", 'utf8');
		config = JSON.parse(source);
		resolve();
	});
};

let connectDb = function() {
	console.log("Connecting to DB at " + config.mongoUri);

	return mongodb.MongoClient.connect(config.mongoUri)
	.then(connected_db => {
		console.log("Connected to DB");
		db = connected_db;
	});
};

let initLogic = function() {
	return new Promise((resolve, reject) => {
		logic = new gameLogic.Logic({
			db: db,
			apiKey: config.apiKey
		});
		resolve();
	})
	.then(() => logic.initialize());
};

let main = function() {
	let args;

	return new Promise((resolve, reject) => {
		args = minimist(process.argv);
		resolve();
	})
	.then(() => {
		if(args.special == 'import-masteries') {
			return readConfig()
			.then(connectDb)
			.then(() => {
				return crawl.importMasteries(args.platform, args.summoner, {
					db: db,
					apiKey: config.apiKey
				});
			})
			.then(() => {
				console.log("Success");
				return db.close();
			});
		}else if(args.setup == 'create-collections') {
			return readConfig()
			.then(connectDb)
			.then(() => {
				return setup.createCollections({
					db: db
				});
			})
			.then(() => {
				console.log("Created collections");
				return db.close();
			});
		}else if(args.setup == 'cache-champions') {
			return readConfig()
			.then(connectDb)
			.then(() => {
				return setup.cacheChampions({
					db: db,
					apiKey: config.apiKey
				});
			})
			.then(() => {
				console.log("Caching complete");
				return db.close();
			});
		}else{
			assert(!args.setup);

			return readConfig()
			.then(connectDb)
			.then(initLogic)
			.then(() => {
				let server = new expressServer.Server({
					logic: logic
				});
				return server.run(config.serverPort);
			});
		}
	});
};

main()
.catch(error => {
	console.error("Error during initialization");
	console.error(error);
});

