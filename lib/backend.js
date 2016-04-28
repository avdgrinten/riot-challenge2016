
"use strict";

//const assert = require('assert');
//const request = require('request');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

let Backend = class {
	constructor(opts) {
		this._logic = opts.logic;
	}

	setupApp() {
		let app = express();
		let jsonParser = bodyParser.json();

		app.use(cookieParser());

		app.get('/dynamic/portal', (req, res) => {
			res.set('Content-Type', 'text/html');

			let user;
			if(!req.cookies.id || !(user = this._logic.getUser(req.cookies.id))) {
				res.set('Content-Type', 'application/json');
				res.send(JSON.stringify({
					state: "summoner-select"
				}));
				return;
			}

			res.set('Content-Type', 'application/json');
			res.send(JSON.stringify({
				state: "summoner-home"
			}));
		});
		
		app.get('/dynamic/lobby/:lobbyId', (req, res) => {
			let user;
			if(!req.cookies.id || !(user = this._logic.getUser(req.cookies.id))) {
				res.set('Content-Type', 'application/json');
				res.send(JSON.stringify({ error: null }));
				return;
			}

			res.set('Content-Type', 'application/json');
			res.send(JSON.stringify({
				state: 'lobby-select',
				user: {
					displayName: user.summoner.displayName,
					profileIcon: 'http://ddragon.leagueoflegends.com'
							+ '/cdn/6.8.1/img/profileicon/'
							+ user.summoner.profileIcon + '.png'
				}
			}));
		});

		app.post('/api/poll/:lobbyId', (req, res) => {
			let lobby = this._logic.getLobby(req.params.lobbyId);
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

		app.post('/api/play-solo', jsonParser, (req, res) => {
			if(!req.body)
				return res.sendStatus(400);

			res.set('Content-Type', 'application/json');
			res.send(JSON.stringify({ error: null }));
		});

		app.post('/api/play-party', jsonParser, (req, res) => {
			if(!req.body)
				return res.sendStatus(400);

			let lobby = this._logic.createLobby();

			res.set('Content-Type', 'application/json');
			res.send(JSON.stringify({
				error: null,
				lobbyId: lobby.id
			}));
		});

		app.post('/api/select-summoner', jsonParser, (req, res) => {
			if(!req.body)
				return res.sendStatus(400);

			this._logic.getSummonerByName(req.body.platform, req.body.summonerName)
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
};

module.exports = Backend;

