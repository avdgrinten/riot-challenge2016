#!/usr/bin/env node

"use strict";

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const bunyan = require('bunyan');
const minimist = require('minimist');
const mongodb = require('mongodb');
const express = require('express');

const dbUtils = require('./lib/db-utils.js');
const staticData = require('./lib/static-data.js');
const crawl = require('./lib/crawl.js');
const gameLogic = require('./lib/game-logic.js');
const riotApi = require('./lib/riot-api.js');
const Frontend = require('./lib/frontend.js');
const Backend = require('./lib/backend.js');

let config;
let db;
let collections = {
	versions: null,
	champions: null,
	summoners: null
};
let staticCache;
let realtimeCrawlers = { };
let sampler;
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
	.then(connection => {
		console.log("Connected to DB");
		db = connection;

		return Promise.resolve()
		.then(() => {
			return dbUtils.getVersionsCollection({
				db: db
			})
			.then(collection => {
				collections.versions = collection;
			});
		})
		.then(() => {
			return dbUtils.getChampionsCollection({
				db: db
			})
			.then(collection => {
				collections.champions = collection;
			});
		})
		.then(() => {
			return dbUtils.getSummonersCollection({
				db: db
			})
			.then(collection => {
				collections.summoners = collection;
			});
		});
	});
};

let initStaticCache = function() {
	return new Promise((resolve, reject) => {
		staticCache = new staticData.StaticCache({
			versionsCollection: collections.versions,
			championsCollection: collections.champions,
			apiKey: config.apiKey
		});
		resolve();
	})
	.then(() => staticCache.initialize());
};

let initRealtimeCrawlers = function() {
	let rate = config.realtimeRate || 8;

	return Object.keys(riotApi.platforms).forEach(platform_id => {
		let crawler = new crawl.RealtimeCrawler({
			summonersCollection: collections.summoners,
			platformId: platform_id,
			apiKey: config.apiKey,
			queue: new riotApi.ThrottleQueue(rate, 10)
		});

		realtimeCrawlers[platform_id] = crawler;
	});
};

let initBackgroundCrawlers = function() {
	let rate = config.backgroundRate || 2;

	let logger = bunyan.createLogger({
		name: 'backgroundCrawler',
		streams: [
			{ path: 'background-crawler.log', level: 'warn' }
		]
	});

	let crawlers = Object.keys(riotApi.platforms).map(platform_id => {
		return new crawl.BackgroundCrawler({
			logger: logger,
			summonersGoal: config.summonersGoal,

			summonersCollection: collections.summoners,
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

let initSampler = function() {
	return new Promise((resolve, reject) => {
		sampler = new crawl.Sampler({
			summonersCollection: collections.summoners,
		});
		resolve();
	});
};

let initLogic = function() {
	return new Promise((resolve, reject) => {
		logic = new gameLogic.Logic({
			staticCache: staticCache,
			sampler: sampler
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
		if(args.setup == 'cache-data') {
			return readConfig()
			.then(connectDb)
			.then(() => {
				return staticData.cacheData({
					versionsCollection: collections.versions,
					championsCollection: collections.champions,
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
			.then(initStaticCache)
			.then(initRealtimeCrawlers)
			.then(initBackgroundCrawlers)
			.then(initSampler)
			.then(initLogic)
			.then(() => {
				frontend = new Frontend({
					staticUrl: config.frontend && config.frontend.staticUrl
				});
			})
			.then(() => {
				backend = new Backend({
					staticCache: staticCache,
					logic: logic,
					crawlers: realtimeCrawlers
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

