
"use strict";

const path = require('path');
const fs = require('fs');
const express = require('express');
const hb = require('handlebars');

let Frontend = class {
	constructor(opts) {
		this._host = opts.host;
		this._port = opts.port;

		let source = fs.readFileSync(__dirname + "/../data/main.handlebars", 'utf8');
		this._template = hb.compile(source);
	}

	setupApp() {
		let app = express();

		app.get('/', (req, res) => {
			res.set('Content-Type', 'text/html');
			res.send(this._template({
				mountPath: ''
			}));
		});

		app.get(/^\/((?:[a-zA-Z0-9+-]{4})+)$/, (req, res) => {
			res.set('Content-Type', 'text/html');
			res.send(this._template({
				mountPath: ''
			}));
		});

		app.get('/frontend/templates.js', (req, res) => {
			new Promise((resolve, reject) => {
				let dir_path = __dirname + '/../data/templates';
				fs.readdir(dir_path, (error, files) => {
					if(error)
						return reject(error);
					
					resolve(files);
				});
			})
			.then(files => Promise.all(files.map(file => {
				return new Promise((resolve, reject) => {
					let file_path = __dirname + '/../data/templates/' + file;
					fs.readFile(file_path, 'utf8', (error, source) => {
						if(error)
							return reject(error);
						
						resolve(source);
					});
				})
				.then(source => {
					return {
						identifier: path.basename(file, '.handlebars'),
						code: hb.precompile(source)
					};
				});
			})))
			.then(compiled_objects => {
				let joined = "var templates = { };\n" + compiled_objects.map(object => {
					return "templates['" + object.identifier + "']"
							+ " = Handlebars.template(" + object.code + ");\n";
				}).join('\n');
				res.set('Content-Type', 'application/javascript');
				res.send(joined);
			})
			.catch(error => {
				console.error("Error while composing client templates");
				console.error(error);
			});
		});

		return app;
	}
};

module.exports = Frontend;

