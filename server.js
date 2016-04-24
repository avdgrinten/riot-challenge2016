
"use strict";

const path = require('path');
const fs = require('fs');
const express = require('express');
const hb = require('handlebars');

const config_src = fs.readFileSync(__dirname + "/config.json", 'utf8');
const config = JSON.parse(config_src);

const template_src= fs.readFileSync(__dirname + "/data/main.handlebars", 'utf8');
const template = hb.compile(template_src);

const app = express();

app.get("/", function(req, res) {
	res.set('Content-Type', 'text/html');
	res.send(template({ message: "Hello" }));
});

app.get("/templates.js", function(req, res) {
	let compile = file => new Promise((resolve, reject) => {
		fs.readFile(__dirname + "/data/templates/" + file, 'utf8', (error, source) => {
			if(error) {
				reject(error);
			}else{
				resolve(source);
			}
		});
	}).then(source => {
		return {
			identifier: path.basename(file, '.handlebars'),
			code: hb.precompile(source)
		};
	});

	new Promise((resolve, reject) => {
		fs.readdir(__dirname + "/data/templates", (error, files) => {
			if(error) {
				reject(error);
			}else{
				resolve(files);
			}
		});
	}).then(files => {
		return Promise.all(files.map(compile))
	}).then(compiled_objects => {
		let joined = "var templates = { };\n" + compiled_objects.map(object => {
			return "templates." + object.identifier + " = " + object.code + ";\n";
		}).join('\n');
		res.set('Content-Type', 'application/javascript');
		res.send(joined);
	}).catch(error => {
		console.error("Error while composing client templates");
		console.error(error);
	});
});

app.use(express.static(__dirname + "/static/"));

const server = require("http").createServer(app);
server.listen(config.serverPort);

console.log("Server running on port: " + config.serverPort);

