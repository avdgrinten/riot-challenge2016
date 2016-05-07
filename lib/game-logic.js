
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
	constructor(logic, id, name) {
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
		
		this._postUpdate('arrange-lobby', { });
	}

	pollUpdates(sequence_id) {
		if(sequence_id < this._updates.length) {
			return Promise.resolve(this._updates.slice(sequence_id));
		}else if(sequence_id == this._updates.length) {
			return new Promise((resolve, reject) => {
				this._waitQueue.push(update => resolve([ update ]));
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
			user: {
				displayName: player.session.summoner.displayName,
				profileIcon: 'http://ddragon.leagueoflegends.com'
						+ '/cdn/6.8.1/img/profileicon/'
						+ player.session.summoner.profileIcon + '.png'
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
		assert(this.state == Lobby.kStateArrange);

		var player = this._findPlayerBySession(session);
		if(player.isReady)
			return false;
		player.isReady = true;

		if(this._players.every(player => player.isReady)) {
			this.state = Lobby.kStateActive;
			this._postUpdate('start-game', { });
			this._nextRound();
		}
	}

	lockAnswer(session, answer) {
		let player = this._findPlayerBySession(session);
		if(player.currentAnswer)
			return false;

		player.currentAnswer = answer;
		return true;
	}

	_postUpdate(type, data) {
		let update = {
			type: type,
			sequenceId: this._updates.length,
			data: data
		};
		this._updates.push(update);

		this._waitQueue.forEach(handler => handler(update));
		this._waitQueue.splice(this._waitQueue.length);
	}

	_findPlayerBySession(session) {
		return this._players.find(player => player.session == session);
	}

	_nextRound() {
		this._currentRound++;

		let entry = selectRandom(questionPool);

		this._logic.sampleRandomMasteries(entry.id)
		.then(data_array => {
			assert(data_array.length == 1);
			let question = entry.builder.generate(this._logic, data_array[0]);
			
			this._currentQuestion = question;
			this._postUpdate('round', {
				round: this._currentRound,
				numRounds: this._numRounds,
				question: question.userData()
			});

			this._secondsLeft = 10;
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
		this._players.forEach(player => {
			if(!player.currentAnswer)
				return;

			if(this._currentQuestion.checkAnswer(player.currentAnswer))
				player.score += 100;
		});

		this._postUpdate('scores', this._players.map(player => {
			return {
				index: player.index,
				score: player.score
			};
		}));

		// clean up and enter the next round
		this._currentQuestion = null;

		this._players.forEach(player => {
			player.currentAnswer = null;
		});

		setTimeout(() => {
			if(this._currentRound < this._numRounds) {
				this._nextRound();
			}else{
				let win_score = this._players.reduce((current, player) => {
					return Math.max(current, player.score);
				}, 0);

				let winners = this._players.filter(player => player.score == win_score);
				
				this._postUpdate('game-complete', {
					winners: winners.map(player => player.index)
				});
			}
		}, 3000);
	}
};
Lobby.kStateArrange = Symbol();
Lobby.kStateActive = Symbol();

let Logic = class {
	constructor(opts) {
		this.staticData = opts.staticData;
		
		this._nameSuffixes = null;

		this._activeSessions = new Map();
		this._activeLobbies = new Map();

		// database collections we need to query
		this._db = opts.db;
		this._summoners = null;
		
		this._apiKey = opts.apiKey;
		this._crawler = opts.crawler;
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
		})
		.then(() => new Promise((resolve, reject) => {
			this._db.collection('summoners', { strict: true }, (error, collection) => {
				if(error)
					return reject(error);

				this._summoners = collection;
				resolve()
			});
		}));
	}

	getSummonerByName(platform, summoner_name) {
		let summoner;
		return new Promise((resolve, reject) => {
			request({
				url: riotApi.buildUrl({
					apiKey: this._apiKey,
					platform: platform,
					endpoint: '/api/lol/{region}/v1.4/summoner/by-name/{summonerNames}',
					args: {
						summonerNames: summoner_name
					}
				}),
				json: true
			}, (error, res, body) => {
				if(error)
					return reject(error);

				let key = summoner_name.toLowerCase().replace(/ /g, '');
				if(!(key in body)) {
					resolve(null);
				}else{
					var entry = body[key];
					summoner = {
						summonerId: entry.id,
						displayName: entry.name,
						profileIcon: entry.profileIconId
					};
					resolve();
				}
			});
		})
		.then(() => {
			return this._crawler.updateMasteries(platform, summoner.summonerId);
		})
		.then(() => summoner);
	}

	sampleRandomMasteries(question_id) {
		return this._summoners.aggregate([
			{ $match: { applicableQuestions: question_id } },
			{ $sample: { size: 1 } }
		]).toArray();
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

	createLobby() {
		// generate a unique lobby ID
		let id;
		do {
			var entropy = crypto.randomBytes(12);
			id = entropy.toString('base64').replace(/\//g, '-');
		} while(this._activeLobbies.get(id));

		// generate a random lobby name
		let name = selectRandom(this.staticData.allChampions()).name
				+ "'s " + selectRandom(this._nameSuffixes);

		let lobby = new Lobby(this, id, name);
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

