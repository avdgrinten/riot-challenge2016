
const fs = require("fs");
const express = require("express");

const config = JSON.parse(fs.readFileSync("./config.json", "utf8"));

const app = express();

app.use(express.static(__dirname + "/"));
app.get("/", function(request, result) {
	result.sendFile(__dirname + "/static/index.html");
});

const server = require("http").createServer(app);
server.listen(config.serverPort);

console.log("Server running on port: " + config.serverPort);
