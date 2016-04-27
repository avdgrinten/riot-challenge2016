
"use strict";

//const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
//const request = require('request');
const express = require('express');
const hb = require('handlebars');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

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
		let app = express();
		let jsonParser = bodyParser.json();

		app.use(cookieParser());
		app.use(express.static(__dirname + '/../static/'));

		app.get('/', (req, res) => {
			res.set('Content-Type', 'text/html');
			res.send(this._template({

			}));
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
					return "templates['" + object.identifier + "']"
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

		app.get('/dynamic/portal', (req, res) => {
			res.set('Content-Type', 'text/html');
			let state = "summoner-select";

			if(req.cookies.id && !!this._logic.getUser(req.cookies.id)) {
				state = "lobby-select";
				let user = this._logic.getUser(req.cookies.id);
				res.send(JSON.stringify({
					state: state,
					user: {
						displayName: user.summoner.displayName,
						profileIcon: "http://ddragon.leagueoflegends.com/cdn/6.8.1/img/profileicon/" + user.summoner.profileIcon + ".png"
					},
					contentType: 'application/json'
				}));
			}else{	
				res.send(JSON.stringify({
					state: state,
					contentType: 'application/json'
				}));
			}
		});

		app.post('/api/poll/:lobby', (req, res) => {
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

		app.post('/api/select-summoner', jsonParser, (req, res) => {
			if(!req.body)
				return res.sendStatus(400);

			this._logic.getSummonerByName('EUW1', req.body.summonerName)
			.then(summoner => {
				if(!summoner) {
					res.status(403);
					res.set('Content-Type', 'application/json');
					res.send(JSON.stringify({
						error: 'SummonerNotFound'
					}));
				}

				let user = this._logic.createUser(summoner);

				res.cookie('id', user.id);
				res.set('Content-Type', 'application/json');
				res.send(JSON.stringify({ error: null }));
			})
			.catch(error => {
				console.error("Error while retrieving summoner");
				console.error(error);
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

