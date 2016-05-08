#!/usr/bin/env node

"use strict";

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const bunyan = require('bunyan');
const minimist = require('minimist');
const mongodb = require('mongodb');
const express = require('express');

const setup = require('./lib/setup.js');
const StaticData = require('./lib/static-data.js');
const crawl = require('./lib/crawl.js');
const gameLogic = require('./lib/game-logic.js');
const riotApi = require('./lib/riot-api.js');
const Frontend = require('./lib/frontend.js');
const Backend = require('./lib/backend.js');

let config;
let db;
let staticData;
let realtimeCrawler;
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

let initStaticData = function() {
	return new Promise((resolve, reject) => {
		staticData = new StaticData({
			db: db,
			apiKey: config.apiKey
		});
		resolve();
	})
	.then(() => staticData.initialize());
};

let initRealtimeCrawler = function() {
	return new Promise((resolve, reject) => {
		let rate = config.realtimeRate || 8;
		realtimeCrawler = new crawl.RealtimeCrawler({
			db: db,
			apiKey: config.apiKey,
			queue: new riotApi.ThrottleQueue(rate, 10)
		});
		resolve();
	})
	.then(() => realtimeCrawler.initialize());
};

let initBackgroundCrawlers = function() {
	let rate = config.backgroundRate || 2;

	let logger = bunyan.createLogger({
		name: 'backgroundCrawler',
		streams: [
			{ path: 'background-crawler.log' }
		]
	});

	let crawlers = Object.keys(riotApi.platforms).map(platform_id => {
		return new crawl.BackgroundCrawler({
			logger: logger,
			db: db,
			platformId: platform_id,
			apiKey: config.apiKey,
			queue: new riotApi.ThrottleQueue(rate, 10)
		});
	});

	return Promise.all(crawlers.map(crawler => crawler.initialize()))
	.then(() => {
		return Promise.all(crawlers.map(crawler => crawler.run()));
	});
};

let initLogic = function() {
	return new Promise((resolve, reject) => {
		logic = new gameLogic.Logic({
			staticData: staticData,
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
			.then(initStaticData)
			.then(initRealtimeCrawler)
			.then(initBackgroundCrawlers)
			.then(initLogic)
			.then(() => {
				frontend = new Frontend({
					host: config.host,
					port: config.serverPort
				});
			})
			.then(() => {
				backend = new Backend({
					logic: logic,
					crawler: realtimeCrawler
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

