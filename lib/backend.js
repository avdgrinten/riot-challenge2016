
"use strict";

//const assert = require('assert');
//const request = require('request');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

const gameLogic = require('./game-logic.js');
const riotApi = require('./riot-api.js');

let Backend = class {
	constructor(opts) {
		this._staticCache = opts.staticCache;
		this._logic = opts.logic;
		this._crawlers = opts.crawlers;

		this._jsonMiddleware = bodyParser.json();

		this._requireBodyMiddleware = (req, res, next) => {
			if(!req.body)
				return res.status(400).json({
					error: 'body-required'
				});
			
			next();
		};

		this._requireSessionMiddleware = (req, res, next) => {
			if(!req.session)
				return res.status(400).json({
					error: 'session-required'
				});

			if(!req.session.alive)
				return res.status(403).json({
					error: 'dead-session'
				});
			
			next();
		};
		
		this._requireSessionInLobbyMiddleware = (req, res, next) => {
			if(!req.lobby.containsSession(req.session)) {
				return res.status(403).json({
					error: 'user-not-in-lobby'
				});
			}
			
			next();
		};
	}

	setupApp() {
		let app = express();
		
		//app.use((req, res, next) => setTimeout(next, 1000));
		app.use(cookieParser());

		app.use((req, res, next) => {
			if(req.cookies.id)
				req.session = this._logic.getSession(req.cookies.id);

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

		router.get('/site',
			this._requireSessionMiddleware,
			(req, res) => {
				res.json({
					summoner: {
						displayName: req.session.summoner.displayName,
						profileIcon: this._staticCache.profileIconUrl(req.session.summoner)
					},
					lobbies: req.session.lobbies.map(lobby => {
						return {
							id: lobby.id,
							name: lobby.name,
							summoners: lobby.getPlayers()
							.filter(session => session != req.session)
							.map(session => {
								return {
									displayName: session.summoner.displayName,
									profileIcon: this._staticCache.profileIconUrl(session.summoner)
								};
							})
						};
					})
				});
			}
		);

		router.post('/select-summoner',
			this._jsonMiddleware,
			this._requireBodyMiddleware,
			(req, res, next) => {
				if(!riotApi.isPlatform(req.body.platform))
					return res.status(403).json({
						error: 'illegal-platform'
					});

				this._crawlers[req.body.platform].getSummonerByName(req.body.summonerName)
				.then(summoner => {
					if(summoner) {
						let session = this._logic.createSession(summoner);

						res.cookie('id', session.id);
						res.json({
							error: null
						});
					}else{
						res.status(403).json({
							error: 'summoner-not-found'
						});
					}
				})
				.catch(error => next(error));
			}
		);

		router.post('/cancel-session',
			this._requireSessionMiddleware,
			this._jsonMiddleware,
			this._requireBodyMiddleware,
			(req, res, next) => {
				req.session.invalidate();

				res.json({
					error: null
				});
			}
		);

		router.post('/play-solo',
			this._requireSessionMiddleware,
			this._jsonMiddleware,
			this._requireBodyMiddleware,
			(req, res) => {
				let lobby = this._logic.createLobby('solo', req.session);

				res.json({
					error: null,
					lobbyId: lobby.id
				});
			}
		);

		router.post('/play-party',
			this._requireSessionMiddleware,
			this._jsonMiddleware,
			this._requireBodyMiddleware,
			(req, res) => {
				let lobby = this._logic.createLobby('party', req.session);

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
			this._requireSessionMiddleware,
			this._requireSessionInLobbyMiddleware,
			(req, res) => {
				res.json({
					name: req.lobby.name,
					summoner: {
						displayName: req.session.summoner.displayName,
						profileIcon: this._staticCache.profileIconUrl(req.session.summoner)
					},
					ownIndex: req.lobby.indexOfSession(req.session)
				});
			}
		);

		router.get('/updates',
			this._requireSessionMiddleware,
			this._requireSessionInLobbyMiddleware,
			(req, res) => {
				let sequence_id = parseInt(req.query.sequenceId);
				req.lobby.pollUpdates(sequence_id)
				.then(updates => {
					res.json(updates);
				});
			}
		);
		
		router.post('/ready',
			this._requireSessionMiddleware,
			(req, res) => {
				// TODO: handle errors from setReady()
				req.lobby.setReady(req.session);

				res.json({
					error: null
				});
			}
		);
		
		router.post('/join',
			this._requireSessionMiddleware,
			(req, res) => {
				let success = req.lobby.joinSession(req.session);
				if(!success)
					return res.json({
						error: 'join-failed'
					});

				res.json({
					error: null
				});
			}
		);

		router.post('/lock-answer',
			this._requireSessionMiddleware,
			this._requireSessionInLobbyMiddleware,
			this._jsonMiddleware,
			(req, res) => {
				let round = parseInt(req.query.round);
				if(req.lobby.lockAnswer(req.session, round, req.body.answer)) {
					res.json({
						error: null
					});
				}else{
					res.status(403).json({
						error: 'lock-failed'
					});
				}
			}
		);
		
		return router;
	}
};

module.exports = Backend;
