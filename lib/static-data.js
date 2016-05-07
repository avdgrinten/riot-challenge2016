
"use strict";

const dbUtils = require('./db-utils.js');

class StaticData {
	constructor(opts) {
		this._championsList = [ ];
		this._championsMap = { };

		this._db = opts.db;
	}

	initialize() {
		return dbUtils.getChampionsCollection({ db: this._db })
		.then(collection => collection.find().toArray())
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
};

module.exports = StaticData;

