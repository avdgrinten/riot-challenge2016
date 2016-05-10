
"use strict";

const assert = require('assert');

const jsUtils = require('./js-utils.js');

let GuessMainBuilder = class {
	constructor(opts) {
		this._numMastered = opts.numMastered;
		this._numChoices = opts.numChoices;
	}
	
	applicable(data) {
		return data.masteries.filter(entry => entry.level == 5).length
				>= this._numMastered + 1;
	}

	generate(logic, data) {
		// generate a list of at least _numMastered + 1 champions that
		// the summoner has at champion level 5
		let skilled = data.masteries
		.filter(entry => entry.level == 5)
		.map(entry => entry.championId)
		.slice(0, this._numMastered + 1);

		assert(skilled.length >= this._numMastered + 1)
		
		// find _numChoices - 1 additional champions, add the main and shuffle the list
		let candidates = logic.staticCache.allChampions()
		.map(champion => champion.id)
		.filter(champion_id => {
			if(skilled.indexOf(champion_id) != -1)
				return false;
			return true;
		})
		jsUtils.shuffleInPlace(candidates);

		let choices = candidates.slice(0, this._numChoices - 1);
		choices.push(skilled[0]);
		jsUtils.shuffleInPlace(choices);

		return new GuessMainBuilder.Question(logic, skilled[0],
				skilled.slice(1), choices);
	}
};
GuessMainBuilder.Question = class {
	constructor(logic, main, mastered, choices) {
		this._logic = logic;
		this._main = main;
		this._mastered = mastered;
		this._choices = choices;
	}

	userData() {
		return {
			questionType: 'guess-main',
			mastered: this._mastered.map(champion_id => {
				var champion = this._logic.staticCache.getChampion(champion_id);
				return {
					id: champion.id,
					championImg: this._logic.staticCache.championImgUrl(champion),
					name: champion.name
				};
			}),
			choices: this._choices.map(champion_id => {
				var champion = this._logic.staticCache.getChampion(champion_id);
				return {
					id: champion.id,
					championImg: this._logic.staticCache.championImgUrl(champion),
					name: champion.name
				};
			})
		};
	}

	correctAnswer() {
		return {
			championId: this._main
		};
	}

	checkAnswer(answer) {
		return answer.championId == this._main;
	}
};


let GuessLeastBuilder = class {
	constructor(opts) {
		this._numMastered = opts.numMastered;
		this._numChoices = opts.numChoices;
	}
	
	applicable(data) {
		return data.masteries.filter(entry => entry.level == 5).length
				>= this._numMastered + 2  && data.masteries.length < 100;
	}

	generate(logic, data) {
		// generate a list of at least _numMastered + 2 champions that
		// the summoner has at champion level 5
		let skilled = data.masteries
		.filter(entry => entry.level == 5)
		.map(entry => entry.championId)
		.slice(0, this._numMastered + 2);

		assert(skilled.length >= this._numMastered + 2);
		
		// find least champions, add the remaining mains and shuffle the list
		let candidates = logic.staticCache.allChampions()
		.map(champion => champion.id)
		.filter(champion_id => {
			let mastery = data.masteries.find(entry => entry.championId == champion_id);
			return !mastery;
		});
		jsUtils.shuffleInPlace(candidates);

		let choices = [];
		choices.push(skilled[3]);
		choices.push(skilled[4]);
		choices.push(candidates[0]);
		jsUtils.shuffleInPlace(choices);

		return new GuessLeastBuilder.Question(logic, candidates[0],
				skilled.slice(0, 3), choices);
	}
};
GuessLeastBuilder.Question = class {
	constructor(logic, least, mastered, choices) {
		this._logic = logic;
		this._least = least;
		this._mastered = mastered;
		this._choices = choices;
	}

	userData() {
		return {
			questionType: 'guess-least',
			mastered: this._mastered.map(champion_id => {
				var champion = this._logic.staticCache.getChampion(champion_id);
				return {
					id: champion.id,
					championImg: this._logic.staticCache.championImgUrl(champion),
					name: champion.name
				};
			}),
			choices: this._choices.map(champion_id => {
				var champion = this._logic.staticCache.getChampion(champion_id);
				return {
					id: champion.id,
					championImg: this._logic.staticCache.championImgUrl(champion),
					name: champion.name
				};
			})
		};
	}

	correctAnswer() {
		return {
			championId: this._least
		};
	}

	checkAnswer(answer) {
		return answer.championId == this._least;
	}
};


module.exports = [
	{
		id: 'guess-main(3,3)',
		builder: new GuessMainBuilder({
			numMastered: 3,
			numChoices: 3
		})
	},
	{
		id: 'guess-least(3,3)',
		builder: new GuessLeastBuilder({
			numMastered: 3,
			numChoices: 3
		})
	}
];

