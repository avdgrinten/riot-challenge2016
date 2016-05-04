#!/usr/bin/env node

"use strict";

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const minimist = require('minimist');
const mongodb = require('mongodb');
const express = require('express');

const setup = require('./lib/setup.js');
const crawl = require('./lib/crawl.js');
const gameLogic = require('./lib/game-logic.js');
const riotApi = require('./lib/riot-api.js');
const Frontend = require('./lib/frontend.js');
const Backend = require('./lib/backend.js');

let config;
let db;
let realtimeCrawler;
let backgroundCrawler;
let logic;
let frontend;
let backend;

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

let initRealtimeCrawler = function() {
	return new Promise((resolve, reject) => {
		realtimeCrawler = new crawl.RealtimeCrawler({
			db: db,
			apiKey: config.apiKey,
			queue: new riotApi.ThrottleQueue(8, 10)
		});
		resolve();
	})
	.then(() => realtimeCrawler.initialize());
};

let initBackgroundCrawler = function() {
	return new Promise((resolve, reject) => {
		backgroundCrawler = new crawl.BackgroundCrawler({
			db: db,
			apiKey: config.apiKey,
			queue: new riotApi.ThrottleQueue(2, 10)
		});
		resolve();
	})
	.then(() => backgroundCrawler.initialize())
	.then(() => backgroundCrawler.run());
};

let initLogic = function() {
	return new Promise((resolve, reject) => {
		logic = new gameLogic.Logic({
			db: db,
			apiKey: config.apiKey,
			crawler: realtimeCrawler
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
			.then(initRealtimeCrawler)
			.then(initBackgroundCrawler)
			.then(initLogic)
			.then(() => {
				frontend = new Frontend({
					host: config.host,
					port: config.serverPort
				});
			})
			.then(() => {
				backend = new Backend({
					logic: logic
				});
			})
			.then(() => {
				const app = express();
				app.use('/static', express.static(__dirname + '/static/'));
				app.use(frontend.setupApp());
				app.use(backend.setupApp());

				const http_server = http.createServer(app);
				http_server.listen(config.serverPort);

				console.log("Server running on port: " + config.serverPort);
			});
		}
	});
};

main()
.catch(error => {
	console.error("Error during initialization");
	console.error(error);
	console.error(error.stack);
});

