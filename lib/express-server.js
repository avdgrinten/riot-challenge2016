
"use strict";

//const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
//const request = require('request');
const express = require('express');
const hb = require('handlebars');

let Server = class {
	constructor(opts) {
		this._logic = opts.logic;
		this._app = this.setupExpress();

		let source = fs.readFileSync(__dirname + "/../data/main.handlebars", 'utf8');
		this._template = hb.compile(source);

		this._testUser = this._logic.createUser();
		this._testLobby = this._logic.createLobby();
		this._testLobby.joinUser(this._testUser);

		let player = this._testLobby.findPlayer(this._testUser);
		player.queueMessage({ hello: "world!" });
		setTimeout(() => {
			player.queueMessage({ hello: "again!" });
		}, 4000);
	}

	setupExpress() {
		var app = express();

		app.use(express.static(__dirname + '/../static/'));

		app.get('/', (req, res) => {
// TODO: re-enable random masteries
//			getRandomMasteries().then(masteries => {
				res.set('Content-Type', 'text/html');
				res.send(this._template({ masteries: [ ],
						lobbyId: this._testLobby.id, ingame: false }));
//			});
		});

		app.get(/^\/((?:[a-zA-Z0-9+-]{4})+)$/, function(req, res, next) {
			console.log("lobby", req.params[0]);
		});

		app.get('/templates.js', function(req, res) {
			new Promise((resolve, reject) => {
				let dir_path = __dirname + '/../data/templates';
				fs.readdir(dir_path, (error, files) => {
					if(error)
						return reject(error);
					
					resolve(files);
				});
			})
			.then(files => Promise.all(files.map(file => {
				return new Promise((resolve, reject) => {
					let file_path = __dirname + '/../data/templates/' + file;
					fs.readFile(file_path, 'utf8', (error, source) => {
						if(error)
							return reject(error);
						
						resolve(source);
					});
				})
				.then(source => {
					return {
						identifier: path.basename(file, '.handlebars'),
						code: hb.precompile(source)
					};
				});
			})))
			.then(compiled_objects => {
				let joined = "var templates = { };\n" + compiled_objects.map(object => {
					return "templates." + object.identifier
							+ " = Handlebars.template(" + object.code + ");\n";
				}).join('\n');
				res.set('Content-Type', 'application/javascript');
				res.send(joined);
			})
			.catch(error => {
				console.error("Error while composing client templates");
				console.error(error);
			});
		});

		app.get('/api/poll/:lobby', (req, res) => {
			let lobby = this._logic.getLobby(req.params.lobby);
			if(!lobby) {
				res.status(403).send("Illegal lobby ID");
				return;
			}

			let user = this._logic.getUser(this._testUser.id);
			if(!user) {
				res.status(403).send("Illegal user ID");
				return;
			}

			let player = lobby.findPlayer(user);
			if(!player) {
				res.status(403).send("You are not in this lobby");
				return;
			}

			player.retrieveMessages().then(messages => {
				console.log("answer", messages);
				res.set('Content-Type', 'application/json');
				res.send(JSON.stringify(messages));
			});
		});

		app.post('/api/answer-question/:lobby/:answer', function(req, res) {
			
		});

		return app;
	}

	run(http_port) {
		return new Promise((resolve, reject) => {
			const http_server = http.createServer(this._app);
			http_server.listen(http_port);

			console.log("Server running on port: " + http_port);
			resolve();
		});
	}
};

module.exports.Server = Server;

/* TODO: re-enable random masteries

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

*/

