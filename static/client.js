
var baseUrl;
var backendUrl;

function selectRandom(array) {
	return array[Math.floor(Math.random() * array.length)];
}

function assertEquals(a, b) {
	if(a != b)
		throw new Error("Assertion failed!");
}

function displayError(error) {
	var dom = $.parseHTML(templates["alert"]({ 
		error: error
	}));

	$('#notifications').prepend(dom);
}

var mainSlot = new StateSlot();

var playSound = false;
var backgroundMusic = ["static/sounds/concussive.mp3", "static/sounds/ethereal.mp3", "static/sounds/kinetic.mp3"];
var backgroundAudio = new Audio();
var victoryAudio = new Audio("static/sounds/victory.ogg");

function StateSlot() {
	this._state = null;
}
StateSlot.prototype.enterState = function(state) {
	if(this._state)
		this._state.cancel();
	this._state = state;
	this._state.display();
};
StateSlot.prototype.cancelState = function() {
	if(this._state)
		this._state.cancel();
	this._state = null;
};


function HeaderSummonerState(summoner) {
	this._summoner = summoner;
	this._summonerDom = null;
}
HeaderSummonerState.prototype.display = function() {
	function switchSummoner(event) {
		var dom = $.parseHTML(templates["loading-button"]());
		$("#button-switch-summoner").prepend(dom);
		$("#button-switch-summoner").prop("disabled", true);

		mainSlot.enterState(new SwitchSummonerState());
	};

	this._summonerDom = $.parseHTML(templates["header-summoner"]({
		myself: this._summoner
	}));
	$(this._summonerDom).find("#button-switch-summoner").click(switchSummoner);

	$('.header-summoner').empty().append(this._summonerDom);
};
HeaderSummonerState.prototype.cancel = function() {
	$(this._summonerDom).detach();
};


function HomeState() {
	this._siteRequest = null;
	this._playRequest = null;

	this._headerSlot = new StateSlot();
}
HomeState.prototype.display = function() {
	var self = this;

	function playSoloClick(event) {
		var dom = $.parseHTML(templates["loading-button"]());
		$("#button-solo").prepend(dom);
		$("#button-solo").prop("disabled", true);
		$("#button-party").prop("disabled", true);

		assertEquals(self._playRequest, null);
		self._playRequest = $.post({
			url: backendUrl + '/backend/portal/play-solo',
			dataType: 'json',
			success: function(data) {
				navigateTo('/'  + data.lobbyId);
			},
			error: function(xhr, reason) {
				if(reason == 'abort')
					return;

				displayError({
					url: '/backend/portal/play-solo',
					httpStatus: xhr.status
				});
			},
			complete: function(xhr) {
				assertEquals(self._playRequest, xhr);
				self._playRequest = null;
			}
		});
	}

	function playPartyClick(event) {
		var dom = $.parseHTML(templates["loading-button"]());
		$("#button-party").prepend(dom);
		$("#button-party").prop("disabled", true);
		$("#button-solo").prop("disabled", true);

		assertEquals(self._playRequest, null);
		self._playRequest = $.post({
			url: backendUrl + '/backend/portal/play-party',
			dataType: 'json',
			success: function(data) {
				navigateTo('/'  + data.lobbyId);
			},
			error: function(xhr, reason) {
				if(reason == 'abort')
					return;
				
				displayError({
					url: '/backend/portal/play-party',
					httpStatus: xhr.status
				});
			},
			complete: function(xhr) {
				assertEquals(self._playRequest, xhr);
				self._playRequest = null;
			}
		});
	}

	var dom = $.parseHTML(templates["loading-page"]());
	$('#content').empty().prepend(dom);

	assertEquals(self._siteRequest, null);
	self._siteRequest = $.get({
		url: backendUrl + '/backend/portal/site',
		dataType: 'json',
		success: function(data) {
			var home_dom = $.parseHTML(templates["summoner-home"]({ 
				myself: data.summoner,
				lobbies: data.lobbies.map(function(lobby) {
					return {
						id: lobby.id,
						url: baseUrl + '/' + lobby.id,
						name: lobby.name
					};
				})
			}));
			$(home_dom).find("#button-solo").click(playSoloClick);
			$(home_dom).find("#button-party").click(playPartyClick);

			$(home_dom).find("#lobby-list .continue-link").click(function(event){
				event.preventDefault();

				navigateTo("/" + $(event.currentTarget).data('lobbyId'));
			});

			$('#content').empty().append(home_dom);

			self._headerSlot.enterState(new HeaderSummonerState(data.summoner));
		},
		error: function(xhr, reason) {
			if(reason == 'abort')
				return;
			
			if(xhr.status == 400 && xhr.responseJSON.error == 'session-required') {
				mainSlot.enterState(new SelectSummonerState({ }));
			}else if(xhr.status == 403 && xhr.responseJSON.error == 'dead-session') {
				mainSlot.enterState(new SelectSummonerState({ }));
			}else{
				displayError({
					url: "/backend/portal/site",
					httpStatus: xhr.status
				});
			}
		},
		complete: function(xhr) {
			assertEquals(self._siteRequest, xhr);
			self._siteRequest = null;
		}
	});
};
HomeState.prototype.cancel = function() {
	if(this._siteRequest)
		this._siteRequest.abort();
	if(this._playRequest)
		this._playRequest.abort();

	this._headerSlot.cancelState();
};


function LobbyState(lobby_id) {
	this._lobbyId = lobby_id;
	this._ownIndex = null;

	this._sequenceId = 0;
	this._isAlive = true;

	this._headingDom = null;

	this._headerSlot = new StateSlot();

	this._updateRequest = null;
	this._siteRequest = null;
	this._readyRequest = null;
	this._answerRequest = null;
}
LobbyState.prototype.display = function() {
	var self = this;

	function pollUpdates() {
		assertEquals(self._updateRequest, null);
		self._updateRequest = $.post({
			url: backendUrl + '/backend/lobby/' + self._lobbyId
					+ '/updates?sequenceId=' + self._sequenceId,
			dataType: "json",
			success: function(data) {
				data.forEach(function(update) {
					if(update.sequenceId != self._sequenceId)
						throw new Error("Out-of-order update");
					displayUpdate(update.type, update.data);

					self._sequenceId++;
				});
			},
			error: function(xhr, reason) {
				if(reason == 'abort')
					return;
				
				displayError({
					url: "/backend/lobby/:lobby/updates",
					httpStatus: xhr.status
				});
			},
			complete: function(xhr, reason) {
				assertEquals(self._updateRequest, xhr);
				self._updateRequest = null;

				if(reason == 'success') {
					if(self._isAlive)
						pollUpdates();
				}else{
					console.warn("pollUpdates completed by: " + reason);
				}
			}
		});
	}

	function showVictoryScreen(winners, runners) {
		function returnToHome(event) {
			navigateTo('/');
		}

		$('#lobby-content').empty();
		var dom = $.parseHTML(templates["victory"]({
			winners: winners,
			runners: runners
		}));

		winners.forEach(function(winner) {
			if(winner.index == self._ownIndex && playSound) {
				console.log("victory");
				backgroundAudio.pause();

				victoryAudio.play();
				victoryAudio.onended = function(event) {
					backgroundAudio.play();
				};
			}
		});

		$(dom).find('#victory-button').click(returnToHome);
		$('#lobby-content').append(dom);
	}

	function displayUpdate(type, data) {
		if(type == 'arrange-lobby') {
			var dom = $.parseHTML(templates['arrange-lobby']({ 
				shareUrl: baseUrl + '/' + self._lobbyId
			}));

			$(dom).find('#clipboard-button')
			.tooltip()
			.click(function(event) {
				$(".lobby-link", dom).select();
				try {
					document.execCommand('copy');
				} catch (err) {
					console.error("Unable to copy link!");
				}
			});

			$(dom).find('#ready-button')
			.click(readyClick);

			$('#lobby-content').empty().append(dom);
		}else if(type == 'set-ready'){
			var dom = $.parseHTML(templates['checkmark']());
			$('.summoner[data-index=' + data.index + '] .extensions').append(dom);
		}else if(type == 'start-game') {
			$('.summoner').each(function(){
				$(this).find('.extensions').empty();
				var score = $.parseHTML(templates['score']());
				$(this).find('.extensions').append(score);
			});
		}else if(type == 'join-user') {
			var dom = $.parseHTML(templates["summoner"]({
				index: data.index,
				summoner: data.summoner
			}));
			$('#summoner-list').append(dom);

			var user = {
				index: data.index,
				summoner: data.user
			};
		}else if(type == 'round') {
			var dom = $.parseHTML(templates['question']({
				round: data.round,
				numRounds: data.numRounds,
				mastered: data.question.mastered,
				choices: data.question.choices
			}));
			$(dom).find('.lock-answer').on('click', answerClick);
			$('#lobby-content').empty().append(dom);
		}else if(type == 'seconds-left'){
			if(data.seconds == 0) {
				$('#timer-text').text("Time is up!");
			}else if(data.seconds == 1) {
				$('#timer-text').text("1 second left");
			}else {
				$('#timer-text').text(data.seconds + " seconds left");
			}
		}else if(type == 'correction') {
			$('.lock-answer[data-champion=' + data.answer.championId + ']').removeClass('locked-pick');
			$('.lock-answer[data-champion=' + data.answer.championId + ']').addClass('correct-pick');
			$('.lock-answer').attr('disabled', true);
		}else if(type == 'scores') {
			data.absolute.forEach(function(entry) {
				$('.summoner[data-index=' + entry.index + '] .score').text(entry.score);
			});

			var sorted = $('.summoner').toArray().sort(function(a, b) {
				var a_score = parseInt($(a).find('.score').text());
				var b_score = parseInt($(b).find('.score').text());
				return b_score - a_score;
			});
			$(sorted).detach();
			$('#summoner-list').append(sorted);

			var delta_dom = $.parseHTML(templates['delta-score']({
				delta: data.delta.map(function(delta) {
					return {
						score: delta.score,
						displayName: delta.summoner.displayName,
						profileIcon: delta.summoner.profileIcon
					};
				})
			}));

			$('.delta-score').append(delta_dom);
		}else if(type == 'game-complete') {
			console.log(data.winners);
			showVictoryScreen(data.winners, data.runners);
		}else if(type == 'close-lobby') {
			self._isAlive = false;
		}else{
			displayError({
				message: "Ouch, the server gave us a response we don't understand.",
				details: "Illegal update information",
				data: type
			});
		}
	}

	function readyClick(event) {
		var loading_dom = $.parseHTML(templates['loading-button']());
		$(event.currentTarget).prepend(loading_dom).attr('disabled', true);

		assertEquals(self._readyRequest, null);
		self._readyRequest = $.post({
			url: backendUrl + '/backend/lobby/' + self._lobbyId + '/ready',
			success: function(data) {
				$(event.currentTarget).attr('disabled', true);
				$(event.currentTarget).removeClass('btn-default').addClass('btn-success');
			},
			error: function(xhr, reason) {
				loading_dom.detach();
				$(event.currentTarget).attr('disabled', false);

				if(reason == 'abort')
					return;

				displayError({
					url: "/backend/lobby/{lobbyId}/ready",
					httpStatus: xhr.status
				});
			},
			complete: function(xhr) {
				assertEquals(self._readyRequest, xhr);
				self._readyRequest = null;
			}
		});
	}

	function answerClick(event) {
		var loading_dom = $.parseHTML(templates['loading-button']());
		$(event.currentTarget).find('span').prepend(loading_dom);
		$('.lock-answer').attr('disabled', true);

		assertEquals(self._answerRequest, null);
		self._answerRequest = $.post({
			url: backendUrl + '/backend/lobby/' + self._lobbyId + '/lock-answer',
			data: JSON.stringify({
				answer: {
					championId: $(this).data('champion')
				}
			}),
			contentType: 'application/json',
			success: function(data) {
				$(event.currentTarget).addClass('locked-pick');
				$(loading_dom).detach();
			},
			error: function(xhr, reason) {
				if(reason == 'abort')
					return;

				if(xhr.status == 403 && xhr.responseJSON.error == 'lock-failed') {
					displayError({
						message: "We are sorry but you can only lock once."
					});
				}else{
					displayError({
						url: "/backend/lobby/{lobbyId}/lock-answer",
						httpStatus: xhr.status
					});
				}
			},
			complete: function(xhr) {
				assertEquals(self._answerRequest, xhr);
				self._answerRequest = null;
			}
		});
	}

	var dom = $.parseHTML(templates["loading-page"]());
	$('#content').empty().prepend(dom);

	assertEquals(this._siteRequest, null);
	this._siteRequest = $.get({
		url: backendUrl + '/backend/lobby/' + self._lobbyId + '/site',
		dataType: "json",
		success: function(data) {
			self._ownIndex = data.ownIndex;

			var dom = $.parseHTML(templates['lobby']());
			$('#content').empty().append(dom);

			self._headingDom = $.parseHTML(templates['lobby-heading']({
				name: data.name
			}));
			$('.header-heading').append(self._headingDom);

			self._headerSlot.enterState(new HeaderSummonerState(data.summoner));

			pollUpdates();
		},
		error: function(xhr, reason) {
			if(reason == 'abort')
				return;
			
			if(xhr.status == 400 && xhr.responseJSON.error == 'session-required') {
				mainSlot.enterState(new SelectSummonerState({
					returnToLobby: self._lobbyId
				}));
			}else if(xhr.status == 403 && xhr.responseJSON.error == 'dead-session') {
				mainSlot.enterState(new SelectSummonerState({
					returnToLobby: self._lobbyId
				}));
			}else if(xhr.status == 403 && xhr.responseJSON.error == 'user-not-in-lobby') {
				mainSlot.enterState(new JoinLobbyState(self._lobbyId));
			}else{
				displayError({
					url: "/backend/lobby/{lobbyId}/site",
					httpStatus: xhr.status,
					data: JSON.stringify(xhr.responseJSON, null, 4)
				});
			}
		},
		complete: function(xhr) {
			assertEquals(self._siteRequest, xhr);
			self._siteRequest = null;
		}
	});
};
LobbyState.prototype.cancel = function() {
	$(this._headingDom).detach();

	if(this._siteRequest)
		this._siteRequest.abort();
	if(this._updateRequest)
		this._updateRequest.abort();
	if(this._readyRequest)
		this._readyRequest.abort();
	if(this._answerRequest)
		this._answerRequest.abort();

	this._headerSlot.cancelState();
};

function JoinLobbyState(lobby_id) {
	this._lobbyId = lobby_id;

	this._joinRequest = null;
}
JoinLobbyState.prototype.display = function() {
	var self = this;

	assertEquals(this._joinRequest, null);
	this._joinRequest = $.post({
		url: backendUrl + '/backend/lobby/' + self._lobbyId + '/join',
		dataType: "json",
		success: function(data) {
			mainSlot.enterState(new LobbyState(self._lobbyId));
		},
		error: function(xhr, reason) {
			if(reason == 'abort')
				return;
			
			displayError({
				url: "/backend/lobby/{lobbyId}/site",
				httpStatus: xhr.status,
				data: JSON.stringify(xhr.responseJSON, null, 4)
			});
		},
		complete: function(xhr) {
			assertEquals(self._joinRequest, xhr);
			self._joinRequest = null;
		}
	});
};
JoinLobbyState.prototype.cancel = function() {
	if(this._joinRequest)
		this._joinRequest.abort();
};


function SelectSummonerState(follow) {
	this._follow = follow;

	this._submitRequest = null;
}
SelectSummonerState.prototype.display = function() {
	var self = this;
	function summonerSubmit(event) {
		event.preventDefault();

		var summoner_name = $("#input-summoner-name").val();
		var platform = $("#select-platform").val();

		var dom = $.parseHTML(templates["loading-button"]());
		$("#btn-submit").prepend(dom);
		$("#btn-submit").prop("disabled", true);

		assertEquals(self._submitRequest, null);
		self._submitRequest = $.post({
			url: backendUrl + '/backend/portal/select-summoner',
			data: JSON.stringify({
				summonerName: summoner_name,
				platform: platform
			}),
			success: function(data) {
				localStorage.setItem("summonerName", summoner_name);
				localStorage.setItem("platform", platform);
				if(self._follow.returnToLobby) {
					mainSlot.enterState(new LobbyState(self._follow.returnToLobby));
				}else{
					mainSlot.enterState(new HomeState());
				}
			},
			error: function(xhr, reason) {
				if(reason == 'abort')
					return;
				
				if(xhr.status == 403 && xhr.responseJSON.error == 'summoner-not-found') {
					displayError({
						message: "The summoner name you entered was not found in this region."
					});
					$(".center", "#btn-submit").remove();
					$("#btn-submit").prop("disabled", false);
				}else{
					displayError({
						url: '/backend/portal/select-summoner',
						httpStatus: xhr.status
					});
				}
			},
			complete: function(xhr) {
				assertEquals(self._submitRequest, xhr);
				self._submitRequest = null;
			},
			contentType: 'application/json'
		});
	};

	$('#content').empty();
	var dom = $.parseHTML(templates["summoner-select"]());
	$(dom).find("#submit").submit(summonerSubmit);
	if(localStorage.getItem("summonerName") && localStorage.getItem("platform")) {
		$(dom).find('#input-summoner-name').val(localStorage.getItem("summonerName"));
		$(dom).find('#select-platform').val(localStorage.getItem("platform"));
	}
	$('#content').append(dom);
};
SelectSummonerState.prototype.cancel = function() {
	if(this._submitRequest)
		this._submitRequest.abort();
};


function SwitchSummonerState() {
	this._switchRequest = null;
}
SwitchSummonerState.prototype.display = function() {
	var self = this;

	this._switchRequest = $.post({
		url: backendUrl + '/backend/portal/cancel-session',
		success: function(data) {
			mainSlot.enterState(new SelectSummonerState({ }));
		},
		error: function(xhr, reason) {
			displayError({
				url: "/backend/portal/cancel-session",
				httpStatus: xhr.status
			});
		},
		complete: function(xhr) {
			assertEquals(self._switchRequest, xhr);
			self._switchRequest = null;
		}
	});
};
SwitchSummonerState.prototype.cancel = function() {
	if(this._switchRequest)
		this._switchRequest.abort();
};

function Router() {
	this._routes = [ ];
}
Router.prototype.on = function(spec, handler) {
	this._routes.push({
		spec: spec,
		handler: handler
	});
};
Router.prototype.handle = function(desc) {
	if(!desc)
		desc = {
			path: window.location.pathname,
			params: { }
		};

	for(var i = 0; i < this._routes.length; i++) {
		if(this._testRoute(desc, this._routes[i]))
			return;
	}
};
Router.prototype._testRoute = function(desc, route) {
	var match = route.spec.exec(desc.path);
	if(!match || match[0] != desc.path)
		return false;

	for(var i = 1; i < match.length; i++)
		desc.params[i - 1] = match[i];
	
	route.handler(desc);

	return true;
};

var router = new Router();
router.on(/\//, function(desc) {
	mainSlot.enterState(new HomeState());
});
router.on(/^\/((?:[a-zA-Z0-9+-]{4})+)$/, function(desc) {
	mainSlot.enterState(new LobbyState(desc.params[0]));
});

function navigateTo(url) {
	window.history.pushState(null, 'Guess my main!', url);
	router.handle();
}

window.onpopstate = function(event) {
	router.handle();
};

$(document).ready(function() {
	baseUrl = window.location.protocol + '//' + window.location.host
			+ $('html').data('mountPath');
	backendUrl = $('html').data('backendUrl') || baseUrl;
	
	backgroundAudio.src = selectRandom(backgroundMusic);
	backgroundAudio.play();
	backgroundAudio.onended = function(event) {
		backgroundAudio.src = selectRandom(backgroundMusic);
	};

	$('#checkbox-sound').change(function(event) {
		playSound = event.currentTarget.checked;
	});

	router.handle();
});

