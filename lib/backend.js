
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

		this._jsonMiddleware = bodyParser.json();

		this._requireBodyMiddleware = (req, res, next) => {
			if(!req.body)
				return res.status(400).json({
					error: 'body-required'
				});
			
			next();
		};

		this._requireUserMiddleware = (req, res, next) => {
			if(!req.user)
				return res.status(400).json({
					error: 'user-required'
				});
			
			next();
		};
	}

	setupApp() {
		let app = express();
		
		//app.use((req, res, next) => setTimeout(next, 1000));
		app.use(cookieParser());

		app.use((req, res, next) => {
			if(req.cookies.id)
				req.user = this._logic.getUser(req.cookies.id);

			next();
		});

		app.use('/backend/portal', this._setupPortalRouter());

		app.use('/backend/lobby/:lobbyId',
			(req, res, next) => {
				let lobby = this._logic.getLobby(req.params.lobbyId);
				if(!lobby)
					return res.status(404).json({
						error: 'illegal-lobby'
					});

				req.lobby = lobby;
				next();
			},
			this._setupLobbyRouter());

		return app;
	}

	_setupPortalRouter() {
		let router = express.Router();

		router.get('/site', (req, res) => {
			res.set('Content-Type', 'text/html');

			if(!req.user) {
				res.json({
					state: "summoner-select"
				});
				return;
			}

			res.json({
				state: "summoner-home",
				user: {
					displayName: req.user.summoner.displayName,
					profileIcon: 'http://ddragon.leagueoflegends.com'
							+ '/cdn/6.8.1/img/profileicon/'
							+ req.user.summoner.profileIcon + '.png'
				}
			});
		});

		router.post('/select-summoner',
			this._jsonMiddleware,
			this._requireBodyMiddleware,
			(req, res) => {
				this._logic.getSummonerByName(req.body.platform, req.body.summonerName)
				.then(summoner => {
					if(summoner) {
						let user = this._logic.createUser(summoner);

						res.cookie('id', user.id);
						res.json({
							error: null
						});
					}else{
						res.status(403).json({
							error: 'summoner-not-found'
						});
					}
				})
				.catch(error => {
					console.error("Error while retrieving summoner");
					console.error(error);
				});
			}
		);

		router.post('/play-solo',
			this._requireUserMiddleware,
			this._jsonMiddleware,
			this._requireBodyMiddleware,
			(req, res) => {
				let lobby = this._logic.createLobby();
				lobby.joinUser(req.user);
				lobby.startGame();

				res.json({
					error: null,
					lobbyId: lobby.id
				});
			}
		);

		router.post('/play-party',
			this._requireUserMiddleware,
			this._jsonMiddleware,
			this._requireBodyMiddleware,
			(req, res) => {
				let lobby = this._logic.createLobby();
				lobby.joinUser(req.user);

				res.json({
					error: null,
					lobbyId: lobby.id
				});
			}
		);

		return router;
	}

	_setupLobbyRouter() {
		let router = express.Router();

		router.get('/site',
			this._requireUserMiddleware,
			(req, res) => {
				if(req.lobby.state == gameLogic.Lobby.kStateActive) {
					res.json({
						state: 'active-game',
						user: {
							displayName: req.user.summoner.displayName,
							profileIcon: 'http://ddragon.leagueoflegends.com'
									+ '/cdn/6.8.1/img/profileicon/'
									+ req.user.summoner.profileIcon + '.png'
						}
					});
				}else{
					res.json({
						state: 'lobby-select',
						user: {
							displayName: req.user.summoner.displayName,
							profileIcon: 'http://ddragon.leagueoflegends.com'
									+ '/cdn/6.8.1/img/profileicon/'
									+ req.user.summoner.profileIcon + '.png'
						}
					});
				}
			}
		);

		router.post('/updates',
			this._requireUserMiddleware,
			(req, res) => {
				let sequence_id = parseInt(req.query.sequenceId);
				req.lobby.pollUpdates(sequence_id)
				.then(updates => {
					res.json(updates);
				});
			}
		);

		router.post('/lock-answer',
			this._requireUserMiddleware,
			this._jsonMiddleware,
			(req, res) => {
				req.lobby.lockAnswer(req.body.answer);

				res.json({
					error: null
				});
			}
		);
		
		return router;
	}
};

module.exports = Backend;
