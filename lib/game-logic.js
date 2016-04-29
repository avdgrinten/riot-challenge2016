
"use strict";

const assert = require('assert');
const crypto = require('crypto');
const request = require('request');

const riotApi = require('./riot-api.js');

function shuffleInPlace(array) {
	for (var i = array.length - 1; i > 0; i--) {
		var j = Math.floor(Math.random() * (i + 1));
		var temp = array[i];
		array[i] = array[j];
		array[j] = temp;
	}
	return array;
}

function selectRandom(array) {

}

let ChooseMainQuestion = class {
	static generate(logic, data) {
		let skilled = data.masteries
		.filter(entry => entry.level == 5)
		.map(entry => entry.championId)
		.slice(0, 3);

		if(skilled.length < 3)
			return null;
		
		let candidates = logic.allChampions()
		.map(champion => champion.id)
		.filter(champion_id => {
			if(skilled.indexOf(champion_id) != -1)
				return false;
			return true;
		})
		shuffleInPlace(candidates);

		let choices = candidates.slice(0, 2);
		choices.push(skilled[0]);
		shuffleInPlace(choices);

		return new ChooseMainQuestion(logic, skilled[0],
				skilled.slice(1), choices);
	}

	constructor(logic, main, mastered, choices) {
		this._logic = logic;
		this._main = main;
		this._mastered = mastered;
		this._choices = choices;
	}

	userData() {
		return {
			questionType: 'ChooseMain',
			mastered: this._mastered.map(champion_id => {
				var champion = this._logic.getChampion(champion_id);
				return {
					key: champion.key
				};
			}),
			choices: this._choices.map(champion_id => {
				var champion = this._logic.getChampion(champion_id);
				return {
					key: champion.key
				};
			})
		};
	}
};

let User = class {
	constructor(id, summoner) {
		this.id = id;
		this.summoner = summoner;
	}
};

let Lobby = class {
	constructor(logic, id) {
		this.id = id;
		this.state = Lobby.kStateCreated;

		this._logic = logic;
		this._players = [ ];

		this._updates = [ ];
		this._waiting = [ ];
	}

	pollUpdates(sequence_id) {
		if(sequence_id < this._updates.length) {
			return Promise.resolve(this._updates.slice(sequence_id));
		}else if(sequence_id == this._updates.length) {
			return new Promise((resolve, reject) => {
				this._waiting.push(update => resolve([ update ]));
			});
		}else{
			return Promise.resolve(null);
		}
	}

	joinUser(user) {
		if(this.findPlayer(user))
			return null;
		
		let player = new Player(user);
		this._players.push(player);
		return player;
	}

	findPlayer(user) {
		return this._players.find(player => player.user == user);
	}

	startGame() {
		this.state = Lobby.kStateActive;

		this._logic.sampleRandomMasteries()
		.then(data_array => {
			let candidates = [ ];
			this._logic._questionPool.forEach(Question => {
				data_array.forEach(data => {
					let candidate = Question.generate(this._logic, data);
					if(candidate)
						candidates.push(candidate);
				});
			});

			assert(candidates.length > 0);
			let index = Math.floor(Math.random() * candidates.length);
			let question = candidates[index];

			this._postUpdate('question', question.userData());
		}).catch(error => {
			console.error("Error while chosing a question");
			console.error(error);
		});
	}

	_postUpdate(type, data) {
		let update = {
			type: type,
			sequenceId: this._updates.length,
			data: data
		};
		this._updates.push(update);

		this._waiting.forEach(handler => handler(update));
		this._waiting.splice(this._waiting.length);
	}
};
Lobby.kStateCreated = Symbol();
Lobby.kStateArrange = Symbol();
Lobby.kStateActive = Symbol();

let Player = class {
	constructor(user) {
		this.user = user;
	}
};

let Logic = class {
	constructor(opts) {
		this._questionPool = [
			ChooseMainQuestion
		];

		this._activeUsers = new Map();
		this._activeLobbies = new Map();

		this._championsList = [ ];
		this._championsMap = { };

		// database collections we need to query
		this._db = opts.db;
		this._champions = null;
		this._masteries = null;
		
		this._apiKey = opts.apiKey;
	}

	initialize() {
		return new Promise((resolve, reject) => {
			this._db.collection("champions", { strict: true }, (error, collection) => {
				if(error)
					return reject(error);

				this._champions = collection;
				resolve()
			});
		})
		.then(() => new Promise((resolve, reject) => {
			this._db.collection("masteries", { strict: true }, (error, collection) => {
				if(error)
					return reject(error);

				this._masteries = collection;
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
		return new Promise((resolve, reject) => {
			request({
				url: riotApi.buildUrl({
					apiKey: this._apiKey,
					platform: platform,
					endpoint: '/api/lol/euw/v1.4/summoner/by-name/{summonerNames}',
					args: {
						summonerNames: summoner_name
					}
				}),
				json: true
			}, (error, res, body) => {
				if(error)
					return reject(error);

				let key = summoner_name.toLowerCase().replace(' ', '');
				if(!(key in body))
					return reject("No data returned for " + key);
				resolve(body[key]);
			});
		})
		.then(entry => {
			return {
				summonerId: entry.id,
				displayName: entry.name,
				profileIcon: entry.profileIconId
			};
		});
	}

	sampleRandomMasteries() {
		return this._masteries.aggregate([
			{ $sample: { size: 1 } }
		]).toArray();
	}

	createUser(summoner) {
		let id; // generate a unique user ID
		do {
			var entropy = crypto.randomBytes(32);
			id = entropy.toString('base64').replace('/', '-');
		} while(this._activeUsers.get(id));

		let user = new User(id, summoner);
		this._activeUsers.set(id, user);
		
		return user;
	}

	getUser(id) {
		return this._activeUsers.get(id);
	}

	createLobby() {
		let id; // generate a unique lobby ID
		do {
			var entropy = crypto.randomBytes(12);
			id = entropy.toString('base64').replace('/', '-');
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
	User: User,
	Lobby: Lobby,
	Player: Player,
	Logic: Logic
};

