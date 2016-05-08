
"use strict";

class StaticData {
	constructor(opts) {
		this._championsList = [ ];
		this._championsMap = { };

		this._champions = opts.championsCollection;
	}

	initialize() {
		return this._champions.find().toArray()
		.then(array => {
			array.forEach(entry => {
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

