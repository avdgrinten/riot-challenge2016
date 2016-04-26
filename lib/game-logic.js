
"use strict";

const assert = require('assert');
const crypto = require('crypto');

let User = class {
	constructor(id) {
		this.id = id;
	}
}

let Lobby = class {
	constructor(id) {
		this.id = id;

		this._players = [ ];
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
}

let Player = class {
	constructor(user) {
		this.user = user;

		this._msgQueue = [ ];
		this._retrieveQueue = [ ];
	}
	
	queueMessage(message) {
		let callback = this._retrieveQueue.pop();
		if(callback) {
			assert.equal(this._msgQueue.length, 0);
			callback(message);
		}else{
			this._msgQueue.push(message);
		}
	}

	retrieveMessages() {
		return new Promise((resolve, reject) => {
			var immediate = this._msgQueue.splice(0, this._msgQueue.length);
			if(immediate.length > 0) {
				resolve(immediate);
			}else{
				this._retrieveQueue.push(message => {
					resolve([ message ]);
				});
			}
		});
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

	sampleRandomMasteries() {
		return this._masteries.aggregate([
			{ $sample: { size: 1 } }
		]).toArray();
	}

	createUser() {
		let id; // generate a unique user ID
		do {
			var entropy = crypto.randomBytes(32);
			id = entropy.toString('base64').replace('/', '-');
		} while(this._activeUsers.get(id));

		let user = new User(id);
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

