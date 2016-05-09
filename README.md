
# riot-challenge2016

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

