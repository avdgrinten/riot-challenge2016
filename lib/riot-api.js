
"use strict";

const assert = require('assert');
const fs = require('fs');

let platforms = (() => {
	let source = fs.readFileSync(__dirname + '/../data/riot-platforms.json');
	return JSON.parse(source);
})();

let isPlatform = function(platform) {
	return !!platforms[platform];
};

let buildUrl = function(opts) {
	assert(opts.apiKey);
	assert(opts.platform);
	assert(opts.endpoint);

	let platform = platforms[opts.platform];
	if(!platform)
		throw new Error("Unexpected platform");

	let host = opts.global ? 'global.api.pvp.net' : platform.host;

	let path = opts.endpoint.replace(/\{(\w+)\}/g, (match, variable) => {
		if(variable == 'platformId') {
			return opts.platform;
		}else if(variable == 'region') {
			return platform.region;
		}else{
			if(!opts.args ||!(variable in opts.args))
				throw new Error("Expected URL argument '" + variable + "'");
			return encodeURIComponent(opts.args[variable]);
		}
	});

	let query = Object.keys(opts.query || { }).reduce((current, key) => {
		return '&' + key + '=' + encodeURIComponent(opts.query[key]);
	}, '');

	return 'https://' + host + path + '?api_key=' + opts.apiKey + query;
};

let ThrottleQueue = class {
	constructor(rate_limit, seconds_per_rate) {
		this._rateLimit = rate_limit;
		this._secondsPerRate = seconds_per_rate;

		this._rateSpent = 0;
		this._queue = [ ];
		this._timerHandle = null;
	}


	isBusy() {
		return this._rateSpent < this._rateLimit;
	}

	enqueue(functor) {
		if(this._rateSpent < this._rateLimit) {
			assert(this._queue.length == 0);
			functor();

			this._rateSpent++;
			this._runQueue();
		}else{
			assert(this._timerHandle);

			this._queue.push(functor);
		}
	}

	_runQueue() {
		if(this._timerHandle)
			return;

		this._timerHandle = setInterval(() => {
			this._rateSpent = 0;

			if(this._queue.length == 0) {
				clearInterval(this._timerHandle);
				this._timerHandle = null;
			}else{
				this._queue.splice(0, this._rateLimit).forEach(functor => {
					functor();
					this._rateSpent++;
				});
			}
		}, this._secondsPerRate * 1000);
	}
};

module.exports.platforms = platforms;
module.exports.isPlatform = isPlatform;
module.exports.buildUrl = buildUrl;
module.exports.ThrottleQueue = ThrottleQueue;

