
# riot-challenge2016

## Running the application

### Live version

### Prerequisites

The following programs are required in order to run the server:

* node.js. A recent version is required to run the code.
	We tested the server using version 6.1.0.

* A MongoDB instance. Here a recent version is required too.
	We tested using version 3.2.6.

### Quick start

1. Clone this repository from github

2. Download dependencies via `npm install`

3. Create a `config.json` file containing the following contents:

	```
	{
		"serverPort": 8080,

		"frontend": {
			"staticUrl": "https://s3.amazonaws.com/guess-my-main"
		},

		"mongoUri": <URI of the MongoDB database, e.g. "mongodb://localhost:27017/guess-my-main">,
		"apiKey": <Your Riot API key>
	}
	```

4. Import static data from the Riot API by running `node main.js --setup cache-data`.
	This command caches League champion and version date in the local database.

5. Run the server using `node main.js`. The server has to collect
	some data when it is started for the first time.
	It should display a `Server running on port: 8080` line after 1 - 3 minutes.

6. Visit `http://localhost:8080` to play the game!

### Configuration options

## Design decisions

* Use summoner names instead of seperate logins

	We decided to use League of Legends summoners names instead
	of a seperate name or login system. A disadvantage of this idea
	is that we cannot validate if a summoner name truely belongs
	to the person using it.
	However that should not be a problem because we use the
	summoner name only for display purposes. We do not store any
	data attached to a summoner name.

* Share URLs to play together

	Were using shareable URLs to connect different players.
	This avoids the overhead and clunkiness of a seperate
	search-lobby system.

## Technical discussion

### Components

* Static files (server)

	This component simply serves static files. For optimal performance
	those files should be hosted on a CDN.

* Frontend (server)

	The frontend serves all URLs that are visible to the user.
	This includes the root URL / that serves the home page
	as well as the /{lobbyId} URL that serves an individual lobby or game screen.
	Additionally it serves some JavaScript and CSS files.

	The frontend only serves GET requests. While some of the served files are dynamically
	generated they can all be cached.
	For optimal performance the frontend should be run behind a caching reverse proxy.

	The frontend is completely stateless. It does not access the database
	or game logic. This way multiple frontend servers could be used
	to satisfy large numbers of requests (e.g. to survive a reddit hug of death).

* Backend (server)

	The backend is where all the game logic happens. The backend provides a RESTful
	API at /backend that is used by the client side in order to query
	or manipulate the current game state.

	This is the only stateful server-side component. The backend is connected to a database
	that caches data from Riot's API and stores some internal state.

* Client

	The client is basically a large JavaScript application that
	connects to the backend, retrieves data about the current game
	state and displays this data to the user via HTML/CSS.

### Implementation notes

* Long polling via XHR

	We use long polling to deliver game state updates to the client.
	The other options to do this would have been Web Sockets or
	Server sent events (SSE). While SSE would be perfect for this job
	it is not supported on IE or Edge. We chose long polling over Web Sockets
	because it is easier to integrate into existing HTTP stacks
	and less complex overall.

### Technologies used

* node.js (server side)

	node.js enables us to write both the server and the client in JavaScript.
	Its event-driven model fits perfectly to the kind of web app we had in mind.

* express (server side)

	express provides a painless way to route incomming requests to multiple REST endpoints.
	It also allows us to combine different independent components to a complete server.
	Turning on the front-/backend for a specific server instance
	corresponds to just adding a single middleware function to the express application.

* MongoDB (server side)

* Handlebars.js (server side + client side)

	Handlebars handles all of our HTML templating. If the HTML `<template>` tag
	and other "Web Components" APIs were already implemented in all major browsers
	we probably just would have used that instead. One advantage of Handlebars
	is that we can easily use it on both the client and the server.

* Bootstrap (client side)

	Bootstrap made it possible to develop a pretty and responsive layout
	without having to write CSS code to work around browser flaws
	and differences.

	In addition to Bootstrap we use a few icons (such as loading spinners) from Font Awesome.

* jQuery (client side)

	While most of the jQuery calls in our code could be replaced by a simple
	`element.querySelector()` we still use it because it integrates nicely
	with Bootstrap.

* Web Audio API (client side)

	We use the Web Audio API to play sounds and background music at different
	volume levels and to let the user change the master volume seamlessly.

* History API (client side)

