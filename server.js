
"use strict";

const path = require('path');
const fs = require('fs');
const request = require('request');
const express = require('express');
const hb = require('handlebars');
const mongodb = require('mongodb');
const assert = require('assert');

const config_src = fs.readFileSync(__dirname + "/config.json", 'utf8');
const config = JSON.parse(config_src);

const template_src= fs.readFileSync(__dirname + "/data/main.handlebars", 'utf8');
const template = hb.compile(template_src);

let champions = { };
let db = null;

function findSummoner(summoner_name) {
	return new Promise((resolve, reject) => {
		request({
			url: "https://euw.api.pvp.net/api/lol/euw/v1.4/summoner/by-name/" + summoner_name + "?api_key="
					+ config.apiKey,
			json: true
		}, (error, res, body) => {
			if(error) {
				reject(error);
				return;
			}

			let key = summoner_name.toLowerCase().replace(' ', '');

			resolve({
				id: body[key].id,
				name: body[key].name,
				icon: body[key].profileIconId
			});
		});
	});
}

function getRandomMasteries() {
	return findSummoner('korona').then((summoner) => {
		return new Promise((resolve, reject) => {
			request({
				url: "https://euw.api.pvp.net/championmastery/location/EUW1/player/" + summoner.id 
						+ "/champions?api_key=" + config.apiKey,
				json: true
			}, (error, res, body) => {
				if(error) {
					reject(error);
					return;
				}

				resolve(body.map(entry => {
					return {
						championId: entry.championId,
						championKey: champions[entry.championId].key,
						level: entry.championLevel,
						points: entry.championPoints
					};
				}));
			});
		});
	});
}

const app = express();

app.get("/", function(req, res) {
	getRandomMasteries().then(masteries => {
		res.set('Content-Type', 'text/html');
		res.send(template({ masteries: masteries }));
	});
});

app.get("/templates.js", function(req, res) {
	let compile = file => new Promise((resolve, reject) => {
		fs.readFile(__dirname + "/data/templates/" + file, 'utf8', (error, source) => {
			if(error) {
				reject(error);
			}else{
				resolve(source);
			}
		});
	}).then(source => {
		return {
			identifier: path.basename(file, '.handlebars'),
			code: hb.precompile(source)
		};
	});

	new Promise((resolve, reject) => {
		fs.readdir(__dirname + "/data/templates", (error, files) => {
			if(error) {
				reject(error);
			}else{
				resolve(files);
			}
		});
	}).then(files => {
		return Promise.all(files.map(compile))
	}).then(compiled_objects => {
		let joined = "var templates = { };\n" + compiled_objects.map(object => {
			return "templates." + object.identifier
					+ " = Handlebars.template(" + object.code + ");\n";
		}).join('\n');
		res.set('Content-Type', 'application/javascript');
		res.send(joined);
	}).catch(error => {
		console.error("Error while composing client templates");
		console.error(error);
	});
});

app.use(express.static(__dirname + "/static/"));

new Promise((resolve, reject) => {
	let mongoClient = mongodb.MongoClient;
	let url = config.mongoUri;
	mongoClient.connect(url, function(error, database) {
		if(error) {
			reject(error);
		}else{
			console.log("Connected to db");
			db = database;
			resolve();
		}
	});
}).then(() => {
	return new Promise((resolve, reject) => {
		db.dropCollection("champions", () => { 
			resolve();
		});	
	});
}).then(() => {
	return new Promise((resolve, reject) => {
		request({
			url: "https://global.api.pvp.net/api/lol/static-data/euw/v1.2/champion?api_key="
					+ config.apiKey,
			json: true
		}, (error, res, body) => {
			if(error) {
				reject(error);
				return;
			}

			for(let key in body.data) {
				let entry = body.data[key];
				champions[entry.id] = {
					key: entry.key,
					name: entry.name
				};
			}

			db.createCollection("champions", { }).then((collection) => {
				for(let key in champions) {
					let data = champions[key];
					data.id = key;
					collection.insertOne(data);
				}
				resolve();								
			});
		});
	});
}).then(() => {
	const server = require("http").createServer(app);
	server.listen(config.serverPort);

	console.log("Server running on port: " + config.serverPort);
}).catch(error => {
	console.error("Error during initialization");
	console.error(error);
});
