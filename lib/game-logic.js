
"use strict";

const assert = require('assert');
const crypto = require('crypto');
const request = require('request');

const riotApi = require('./riot-api.js');

let User = class {
	constructor(id, summoner) {
		this.id = id;
		this.summoner = summoner;
	}
}

let Lobby = class {
	constructor(id) {
		this.id = id;

		this.state = Lobby.kStateCreated;
		this._players = [ ];

		this._updates = [ ];
		this._waiting = [ ];

		this.postUpdate('hello');
		setTimeout(() => this.postUpdate('world'), 2000);
	}

	postUpdate(data) {
		let update = {
			sequenceId: this._updates.length,
			data: data
		};
		this._updates.push(update);

		this._waiting.forEach(handler => handler(update));
		this._waiting.splice(this._waiting.length);
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
	}
};
Lobby.kStateCreated = Symbol();
Lobby.kStateArrange = Symbol();
Lobby.kStateActive = Symbol();

let Player = class {
	constructor(user) {
		this.user = user;
	}
}

let Logic = class {
	constructor(opts) {
		this._activeUsers = new Map();
		this._activeLobbies = new Map();

		this._champions = { };

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
				this._champions[entry.id] = {
					key: entry.key,
					name: entry.name
				};
			});
		})
	}

	getChampion(id) {
		return this._champions[id];
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

		let lobby = new Lobby(id);
		this._activeLobbies.set(id, lobby);

		return lobby;
	}

	getLobby(id) {
		return this._activeLobbies.get(id);
	}
}

module.exports = {
	User: User,
	Lobby: Lobby,
	Player: Player,
	Logic: Logic
};

