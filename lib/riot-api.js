
"use strict";

const assert = require('assert');
const fs = require('fs');

let platforms = (() => {
	let source = fs.readFileSync(__dirname + '/../data/riot-platforms.json');
	return JSON.parse(source);
})();

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
			console.log(variable);
			if(!opts.args ||!(variable in opts.args))
				throw new Error("Expected URL argument '" + variable + "'");
			return opts.args[variable];
		}
	});

	console.log('https://' + host + path + '?api_key=' + opts.apiKey);
	return 'https://' + host + path + '?api_key=' + opts.apiKey;
};

module.exports.buildUrl = buildUrl;

