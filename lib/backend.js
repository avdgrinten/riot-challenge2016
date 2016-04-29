
"use strict";

//const assert = require('assert');
//const request = require('request');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const gameLogic = require('./game-logic.js');

let Backend = class {
	constructor(opts) {
		this._logic = opts.logic;
	}

	setupApp() {
		let app = express();
		let jsonParser = bodyParser.json();

		app.use(cookieParser());
		//app.use((req, res, next) => setTimeout(next, 1000));

		app.get('/backend/portal/site', (req, res) => {
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
				state: "summoner-home",
				user: {
					displayName: user.summoner.displayName,
					profileIcon: 'http://ddragon.leagueoflegends.com'
							+ '/cdn/6.8.1/img/profileicon/'
							+ user.summoner.profileIcon + '.png'
				}
			}));
		});

		app.post('/backend/portal/select-summoner', jsonParser, (req, res) => {
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

		app.post('/backend/portal/play-solo', jsonParser, (req, res) => {
			if(!req.body)
				return res.sendStatus(400);
			
			let lobby = this._logic.createLobby();
			lobby.startGame();

			res.set('Content-Type', 'application/json');
			res.send(JSON.stringify({
				error: null,
				lobbyId: lobby.id
			}));
		});

		app.post('/backend/portal/play-party', jsonParser, (req, res) => {
			if(!req.body)
				return res.sendStatus(400);

			let lobby = this._logic.createLobby();

			res.set('Content-Type', 'application/json');
			res.send(JSON.stringify({
				error: null,
				lobbyId: lobby.id
			}));
		});
		
		app.get('/backend/lobby/:lobbyId/site', (req, res) => {
			let user;
			if(!req.cookies.id || !(user = this._logic.getUser(req.cookies.id))) {
				res.set('Content-Type', 'application/json');
				res.send(JSON.stringify({ error: null }));
				return;
			}

			let lobby = this._logic.getLobby(req.params.lobbyId);
			if(!lobby) {
				res.set('Content-Type', 'application/json');
				res.send(JSON.stringify({ error: null }));
				return;
			}

			if(lobby.state == gameLogic.Lobby.kStateActive) {
				res.set('Content-Type', 'application/json');
				res.send(JSON.stringify({
					state: 'active-game',
					user: {
						displayName: user.summoner.displayName,
						profileIcon: 'http://ddragon.leagueoflegends.com'
								+ '/cdn/6.8.1/img/profileicon/'
								+ user.summoner.profileIcon + '.png'
					}
				}));
			}else{
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
			}
		});

		app.post('/backend/lobby/:lobbyId/updates', (req, res) => {
			let lobby = this._logic.getLobby(req.params.lobbyId);
			if(!lobby) {
				res.status(403).send("Illegal lobby ID");
				return;
			}

			let sequence_id = parseInt(req.query.sequenceId);
			lobby.pollUpdates(sequence_id)
			.then(updates => {
				res.set('Content-Type', 'application/json');
				res.send(JSON.stringify(updates));
			});
		});

		app.post('/backend/lobby/:lobbyId/lock-answer', function(req, res) {
			
		});

		return app;
	}
};

module.exports = Backend;
