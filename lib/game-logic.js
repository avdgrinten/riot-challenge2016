
"use strict";

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const request = require('request');

const riotApi = require('./riot-api.js');
const questionPool = require('./questions.js');

function selectRandom(array) {
	return array[Math.floor(Math.random() * array.length)];
}

let Session = class {
	constructor(id, summoner) {
		this.id = id;
		this.summoner = summoner;

		this.alive = true;

		this.lobbies = [ ];
	}

	invalidate() {
		assert(this.alive);
		this.alive = false;
		return true;
	}
};

let Lobby = class {
	constructor(logic, id, name, mode, host_session) {
		this.id = id;
		this.name = name;
		this.state = Lobby.kStateArrange;

		this._logic = logic;
		this._numRounds = 10;

		this._players = [ ];
		this._currentRound = 0;
		this._currentQuestion = null;
		this._secondsLeft = 0;

		this._updates = [ ];
		this._waitQueue = [ ];

		this._lastPoll = Date.now();
		this._terminated = false;

		assert(this.joinSession(host_session));

		if(mode == 'solo') {
			assert(this.setReady(host_session));
		}else if(mode == 'party') {
			this._postUpdate('arrange-lobby', { });
		}else throw new Error("Illegal mode for Session constructor");
		
		setTimeout(() => this._checkIdle(), 30000);
	}

	pollUpdates(sequence_id) {
		this._lastPoll = Date.now();

		if(sequence_id < this._updates.length) {
			return Promise.resolve(this._updates.slice(sequence_id));
		}else if(sequence_id == this._updates.length) {
			return new Promise((resolve, reject) => {
				let handle = {
					timeout: setTimeout(() => {
						let index = this._waitQueue.indexOf(handle);
						assert(index != -1);
						
						resolve([ ]);
						this._waitQueue.splice(index, 1);
					}, 15000),
					functor: update => resolve([ update ])
				};
				this._waitQueue.push(handle);
			});
		}else{
			return Promise.resolve(null);
		}
	}

	joinSession(session) {
		assert(this.state == Lobby.kStateArrange);
		if(this._findPlayerBySession(session))
			return false;
		
		let player = {
			index: this._players.length,
			session: session,
			isReady: false,
			currentAnswer: null,
			score: 0
		};
		this._players.push(player);

		session.lobbies.push(this);

		this._postUpdate('join-user', {
			index: player.index,
			summoner: {
				displayName: player.session.summoner.displayName,
				profileIcon: this._logic.staticCache.profileIconUrl(player.session.summoner)
			}
		});

		return true;
	}

	containsSession(session) {
		return !!this._findPlayerBySession(session);
	}

	indexOfSession(session) {
		return this._findPlayerBySession(session).index;
	}

	setReady(session) {
		if(this.state != Lobby.kStateArrange)
			return false;

		var player = this._findPlayerBySession(session);
		if(player.isReady)
			return false;
		player.isReady = true;

		this._postUpdate('set-ready', { 
			index: player.index
		});

		if(this._players.every(player => player.isReady)) {
			this.state = Lobby.kStateActive;
			this._postUpdate('start-game', { });
			this._nextRound();
		}

		return true;
	}

	lockAnswer(session, round, answer) {
		if(this._currentRound != round)
			return false;

		let player = this._findPlayerBySession(session);
		if(player.currentAnswer)
			return false;

		player.currentAnswer = answer;
		return true;
	}

	getPlayers() {
		return this._players.map(player => player.session);
	}

	_checkIdle() {
		if(Date.now() - this._lastPoll > 30000) {
			this._terminateLobby();
		}else{
			setTimeout(() => this._checkIdle(), 30000);
		}
	}

	_postUpdate(type, data) {
		let update = {
			type: type,
			sequenceId: this._updates.length,
			data: data
		};
		this._updates.push(update);

		this._waitQueue.forEach(handle => {
			handle.functor(update);
			clearTimeout(handle.timeout);
		});
		this._waitQueue.splice(0, this._waitQueue.length);
	}

	_findPlayerBySession(session) {
		return this._players.find(player => player.session == session);
	}

	_nextRound() {
		this._currentRound++;

		let entry = selectRandom(questionPool);

		this._logic._samplers[entry.id].sampleRandomSummoner()
		.then(summoner => {
			let question = entry.builder.generate(this._logic, summoner);
			
			this._currentQuestion = question;
			this._postUpdate('round', {
				round: this._currentRound,
				numRounds: this._numRounds,
				question: question.userData()
			});

			this._secondsLeft = 15;
			this._postUpdate('seconds-left', {
				seconds: this._secondsLeft
			});

			setTimeout(() => this._handleTick(), 1000);
		}).catch(error => {
			console.error("Error while chosing a question");
			console.error(error);
		});
	}

	_handleTick() {
		assert(this._secondsLeft > 0);
		this._secondsLeft--;
	
		this._postUpdate('seconds-left', {
			seconds: this._secondsLeft
		});
		
		if(this._secondsLeft == 0
				|| this._players.every(player => player.currentAnswer)) {
			this._finishRound();
		}else{
			setTimeout(() => this._handleTick(), 1000);
		}
	}

	_finishRound() {
		// inform the clients of the correct answer
		this._postUpdate('correction', {
			answer: this._currentQuestion.correctAnswer()
		});

		// evaluate the given answers and update the scores of all users
		let correct = this._players.filter(player => {
			if(!player.currentAnswer)
				return false;
			return this._currentQuestion.checkAnswer(player.currentAnswer);
		});
		correct.forEach(player => {
			player.score += 100;
		});

		this._postUpdate('scores', {
			absolute: this._players.map(player => {
				return {
					index: player.index,
					score: player.score
				};
			}),
			delta: correct.map(player => {
				return {
					index: player.index,
					summoner: {
						displayName: player.session.summoner.displayName,
						profileIcon: this._logic.staticCache.profileIconUrl(player.session.summoner)
					},
					score: 100
				};
			})
		});

		// clean up and enter the next round
		this._currentQuestion = null;

		this._players.forEach(player => {
			player.currentAnswer = null;
		});

		setTimeout(() => {
			if(this._currentRound < this._numRounds) {
				this._nextRound();
			}else{
				this._finishGame();
			}
		}, 3000);
	}

	_finishGame() {
		let win_score = this._players.reduce((current, player) => {
			return Math.max(current, player.score);
		}, 0);

		let winners = this._players.filter(player => player.score == win_score);
		let runners = this._players.filter(player => {
			return player.score != win_score
		})
		.sort((a, b) => {
			return b.score - a.score;
		});

		this._postUpdate('game-complete', {
			winners: winners.map(player => {
				return {
					index: player.index,
					summoner: {
						displayName: player.session.summoner.displayName,
						profileIcon: this._logic.staticCache.profileIconUrl(player.session.summoner)
					},
					score: player.score,
					icon: this._scoreToRank(player.score)
				};
			}),
			runners: runners.map(player => {
				return {
					index: player.index,
					summoner: {
						displayName: player.session.summoner.displayName,
						profileIcon: this._logic.staticCache.profileIconUrl(player.session.summoner)
					},
					score: player.score,
					icon: this._scoreToRank(player.score)
				};
			}),
		});

		setTimeout(() => {
			assert(this.state == Lobby.kStateActive);
			this.state = Lobby.kStateDead;
		
			this._postUpdate('close-lobby', { });

			this._terminateLobby();
		}, 10000);
	}

	_scoreToRank(score) {
		switch(score) {
			case 1000:
				return 'challenger';
			case 900:
				return 'master';
			case 800:
				return 'diamond';
			case 700:
				return 'platinum';
			case 600: 
			case 500:
				return 'gold';
			case 400: 
			case 300:
				return 'silver';
			case 200: 
			case 100: 
			case 0:
				return 'bronze';
		}

		throw new Error("Illegal score for _scoreToRank()");
	}

	_terminateLobby() {
		if(this._terminated)
			return;
		this._terminated = true;

		this._players.forEach(player => {
			let index = player.session.lobbies.indexOf(this);
			assert(index != -1);
			player.session.lobbies.splice(index, 1);
		});

		this._logic._activeLobbies.delete(this.id);
	}
};
Lobby.kStateArrange = Symbol();
Lobby.kStateActive = Symbol();
Lobby.kStateDead = Symbol();

let Logic = class {
	constructor(opts) {
		this.staticCache = opts.staticCache;
		this._samplers = opts.samplers;
		
		this._nameSuffixes = null;

		this._activeSessions = new Map();
		this._activeLobbies = new Map();
	}

	initialize() {
		return new Promise((resolve, reject) => {
			let path = __dirname + '/../data/name-suffixes.json';
			fs.readFile(path, 'utf8', (error, source) => {
				if(error)
					return reject(error);
				
				this._nameSuffixes = JSON.parse(source);
				resolve();
			});
		});
	}

	createSession(summoner) {
		let id; // generate a unique session ID
		do {
			var entropy = crypto.randomBytes(32);
			id = entropy.toString('base64').replace(/\//g, '-');
		} while(this._activeSessions.get(id));

		let session = new Session(id, summoner);
		this._activeSessions.set(id, session);
		
		return session;
	}

	getSession(id) {
		return this._activeSessions.get(id);
	}

	createLobby(mode, host_session) {
		// generate a unique lobby ID
		let id;
		do {
			var entropy = crypto.randomBytes(12);
			id = entropy.toString('base64').replace(/\//g, '-');
		} while(this._activeLobbies.get(id));

		// generate a random lobby name
		let name = selectRandom(this.staticCache.allChampions()).name
				+ "'s " + selectRandom(this._nameSuffixes);

		let lobby = new Lobby(this, id, name, mode, host_session);
		this._activeLobbies.set(id, lobby);

		return lobby;
	}

	getLobby(id) {
		return this._activeLobbies.get(id);
	}
};

module.exports = {
	Session: Session,
	Lobby: Lobby,
	Logic: Logic
};

