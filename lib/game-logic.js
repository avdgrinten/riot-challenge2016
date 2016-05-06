
"use strict";

const assert = require('assert');
const crypto = require('crypto');
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
	}

	invalidate() {
		assert(this.alive);
		this.alive = false;
		return true;
	}
};

let Lobby = class {
	constructor(logic, id) {
		this.id = id;
		this.state = Lobby.kStateArrange;

		this._logic = logic;

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
		
		let info = {
			index: this._players.length,
			session: session,
			isReady: false,
			currentAnswer: null,
			score: 0
		};
		this._players.push(info);

		this._postUpdate('join-user', {
			index: info.index,
			user: {
				displayName: info.session.summoner.displayName,
				profileIcon: 'http://ddragon.leagueoflegends.com'
						+ '/cdn/6.8.1/img/profileicon/'
						+ info.session.summoner.profileIcon + '.png'
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

		var info = this._findPlayerBySession(session);
		if(info.isReady)
			return false;
		info.isReady = true;

		if(this._players.every(player => player.isReady)) {
			this.state = Lobby.kStateActive;
			this._postUpdate('start-game', { });
			this._nextRound();
		}
	}

	lockAnswer(session, answer) {
		let info = this._findPlayerBySession(session);
		if(info.currentAnswer)
			return false;

		info.currentAnswer = answer;
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
		return this._players.find(info => info.session == session);
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
				numRounds: 10,
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
		this._players.forEach(info => {
			if(!info.currentAnswer)
				return;

			if(this._currentQuestion.checkAnswer(info.currentAnswer))
				info.score += 100;
		});

		this._postUpdate('scores', this._players.map(info => {
			return {
				index: info.index,
				score: info.score
			};
		}));

		// clean up and enter the next round
		this._currentQuestion = null;

		this._players.forEach(info => {
			info.currentAnswer = null;
		});

		setTimeout(() => {
			if(this._currentRound < 3) {
				this._nextRound();
			}else if(this._currentRound >= 3) {
				let winners = [];
				let winScore = 0;
				this._players.forEach(info => {
					if(info.score > winScore) {
						winners = [];
						winScore = info.score;
						winners.push(this.indexOfSession(info.session));
					}else if(info.score == winScore) {
						winners.push(this.indexOfSession(info.session));
					}
				});
				this._postUpdate('game-complete', {
					winners: winners
				});
			}
		}, 3000);
	}
};
Lobby.kStateArrange = Symbol();
Lobby.kStateActive = Symbol();

let Logic = class {
	constructor(opts) {
		this._activeSessions = new Map();
		this._activeLobbies = new Map();

		this._championsList = [ ];
		this._championsMap = { };

		// database collections we need to query
		this._db = opts.db;
		this._champions = null;
		this._summoners = null;
		
		this._apiKey = opts.apiKey;
		this._crawler = opts.crawler;
	}

	initialize() {
		return new Promise((resolve, reject) => {
			this._db.collection('champions', { strict: true }, (error, collection) => {
				if(error)
					return reject(error);

				this._champions = collection;
				resolve()
			});
		})
		.then(() => new Promise((resolve, reject) => {
			this._db.collection('summoners', { strict: true }, (error, collection) => {
				if(error)
					return reject(error);

				this._summoners = collection;
				resolve()
			});
		}))
		.then(() => this._champions.find().toArray())
		.then(champions => {
			champions.forEach(entry => {
				let champion = {
					id: entry.id,
					key: entry.key,
					name: entry.name
				};
				this._championsList.push(champion);
				this._championsMap[entry.id] = champion;
			});
		})
	}

	allChampions() {
		return this._championsList;
	}
	getChampion(id) {
		return this._championsMap[id];
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
		let id; // generate a unique lobby ID
		do {
			var entropy = crypto.randomBytes(12);
			id = entropy.toString('base64').replace(/\//g, '-');
		} while(this._activeLobbies.get(id));

		let lobby = new Lobby(this, id);
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

