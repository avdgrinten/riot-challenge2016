
var frontendUrl;

function displayError(error) {
	$('#notifications').prepend(templates["alert"]({ 
		error: error
	}));
}

var currentScreen = null;
var playSound = false;

function displayScreen(screen) {
	if(currentScreen)
		currentScreen.cancel();
	currentScreen = screen;
	screen.display();
}


function HomeScreen() {

}
HomeScreen.prototype.display = function() {
	function playSoloClick(event) {
		$("#button-solo").prepend(templates["loading-button"]({ }));
		$("#button-solo").prop("disabled", true);

		$.post({
			url: '/backend/portal/play-solo',
			dataType: 'json',
			success: function(data) {
				navigateTo({
					site: "lobby",
					lobbyId: data.lobbyId
				});
			},
			error: function(xhr) {
				displayError({
					url: "api/play-solo",
					httpStatus: xhr.status
				});
			}
		});
	}

	function playPartyClick(event) {
		$("#button-party").prepend(templates["loading-button"]({ }));
		$("#button-party").prop("disabled", true);

		$.post({
			url: '/backend/portal/play-party',
			dataType: 'json',
			success: function(data) {
				navigateTo({
					site: "lobby",
					lobbyId: data.lobbyId
				});
			},
			error: function(xhr) {
				displayError({
					url: "api/play-party",
					httpStatus: xhr.status
				});
			}
		});
	}

	function switchSummoner(event) {
		$("#button-switch-summoner").prepend(templates["loading-button"]({ }));
		$("#button-switch-summoner").prop("disabled", true);

		/*
		$.post({
			url: 'backend/portal/exit-session',
			dataType: 'json',
			success: function(data) {

			},
			error: function(xhr) {

			};
		})
		*/
	};

	$('#content').empty().prepend(templates["loading-page"]({ }));

	$.get({
		url: '/backend/portal/site',
		dataType: 'json',
		success: function(data) {
			if(data.state == "summoner-home"){
				$('#content').empty();
				$('#content').append(templates["summoner-home"]({ 
					myself: data.user
				}));

				$('.header-summoner').empty();
				$('.header-summoner').append(templates["header-summoner"]({
					myself: data.user
				}));

				$('#checkbox-sound').change(function(event) {
					playSound = event.currentTarget.checked;
				});

				$("#button-switch-summoner").click(switchSummoner);
				$("#button-solo").click(playSoloClick);
				$("#button-party").click(playPartyClick);
			}else{
				displayError({
					message: "Ouch, the server gave us a response we don't understand.",
					details: "Illegal state",
					data: data.state
				});
			}
		},
		error: function(xhr) {
			if(xhr.status == 400 && xhr.responseJSON.error == 'user-required') {
				displayScreen(new SelectSummonerScreen({ }));
			}else{
				displayError({
					url: "/backend/portal/site",
					httpStatus: xhr.status
				});
			}
		}
	});
};
HomeScreen.prototype.cancel = function() {

};


function LobbyScreen(lobby_id) {
	this._lobbyId = lobby_id;
	this._index = null;
	this._userList = [];
}
LobbyScreen.prototype.display = function() {
	var self = this;
	var sequence_id = 0;

	function pollUpdates() {
		$.post({
			url: '/backend/lobby/' + self._lobbyId + '/updates?sequenceId=' + sequence_id,
			dataType: "json",
			success: function(data) {
				data.forEach(function(update) {
					if(update.sequenceId != sequence_id)
						throw new Error("Out-of-order update");
					displayUpdate(update.type, update.data);

					sequence_id++;
				});

				pollUpdates();
			},
			error: function(xhr) {
				displayError({
					url: "api/poll/:lobby",
					httpStatus: xhr.status
				});
			}
		});
	}

	function displayUpdate(type, data) {
		if(type == 'arrange-lobby') {
			var state = describeState({
				site: 'lobby',
				lobbyId: self._lobbyId
			});

			var dom = $.parseHTML(templates['lobby-select']({
				shareUrl: frontendUrl + state.url
			}));

			$(dom).find('#clipboard-button')
			.tooltip()
			.click(function(event) {
				$(".lobby-link", dom).select();
				try {
					document.execCommand('copy');
				} catch (err) {
					console.log("Unable to copy link!");
				}
			});

			$(dom).find('#ready-button')
			.click(readyClick);

			$('#content').empty().append(dom);
		}else if(type == 'start-game') {
			self._index = data.ownIndex;
			var source = templates['active-game']({
				myself: data.user
			});
			var dom = $($.parseHTML(source));
			
			$('#content').empty().append(dom);
		}else if(type == 'join-user') {
			$('#summoner-list').append(templates["summoner"]({
				index: data.index,
				summoner: data.user
			}));

			var user = {
				index: data.index,
				summoner: data.user
			};
			self._userList.push(user);
		}else if(type == 'round') {
			var source = templates['question']({
				round: data.round,
				numRounds: data.numRounds,
				mastered: data.question.mastered,
				choices: data.question.choices
			});
			var dom = $($.parseHTML(source));
			$('.lock-answer', dom).on('click', answerClick);
			$('#question-area').empty().append(dom);
		}else if(type == 'seconds-left'){
			if(data.seconds == 0){
				$('#timer-text').text("Time is up!");
			}else if(data.seconds == 1) {
				$('#timer-text').text("1 second left");
			}else{
				$('#timer-text').text(data.seconds + " seconds left");
			}
		}else if(type == 'correction'){
			$('.lock-answer[data-champion=' + data.answer.championId + ']').removeClass('locked-pick');
			$('.lock-answer[data-champion=' + data.answer.championId + ']').addClass('correct-pick');
		}else if(type == 'scores'){
			data.forEach(function(entry) {
				$('.summoner[data-index=' + entry.index + '] .score').text(entry.score);
			});
		}else if(type == 'game-complete') {
			displayScreen(new VictoryScreen(self._userList, data.winners, self._index));
		}else{
			displayError({
				message: "Ouch, the server gave us a response we don't understand.",
				details: "Illegal update information",
				data: type
			});
		}
	}

	function readyClick(event) {
		$.post({
			url: '/backend/lobby/' + self._lobbyId + '/ready',
			success: function(data) {
			},
			error: function(xhr) {
				displayError({
					url: "/backend/lobby/{lobbyId}/ready",
					httpStatus: xhr.status
				});
			}
		});
	}

	function answerClick(event) {
		$(this).append(templates['loading-pick']({ }));
		$('.lock-answer').attr('disabled', 'disabled');
		$.post({
			url: '/backend/lobby/' + self._lobbyId + '/lock-answer',
			data: JSON.stringify({
				answer: {
					championId: $(this).data('champion')
				}
			}),
			contentType: 'application/json',
			success: function(data) {
				$(event.currentTarget).addClass('locked-pick');
				$(".loading-pick", event.currentTarget).remove();
			},
			error: function(xhr) {
				displayError({
					url: "/backend/lobby/{lobbyId}/lock-answer",
					httpStatus: xhr.status
				});
			}
		});
	}

	$('#content').empty().prepend(templates["loading-page"]({ }));
	$.get({
		url: '/backend/lobby/' + self._lobbyId + '/site',
		dataType: "json",
		success: function(data) {
			pollUpdates();
		},
		error: function(xhr) {
			if(xhr.status == 403 && xhr.responseJSON.error == 'user-not-in-lobby') {
				displayScreen(new JoinLobbyScreen(self._lobbyId));
			}else if(xhr.status == 400 && xhr.responseJSON.error == 'user-required') {
				displayScreen(new SelectSummonerScreen({
					returnToLobby: self._lobbyId
				}));
			}else{
				displayError({
					url: "/backend/lobby/{lobbyId}/site",
					httpStatus: xhr.status,
					data: JSON.stringify(xhr.responseJSON, null, 4)
				});
			}
		}
	});
};
LobbyScreen.prototype.cancel = function() {
};

function JoinLobbyScreen(lobby_id) {
	this._lobbyId = lobby_id;
}
JoinLobbyScreen.prototype.display = function() {
	var self = this;

	$.post({
		url: '/backend/lobby/' + self._lobbyId + '/join',
		dataType: "json",
		success: function(data) {
			console.log(data);
		}
	});
};
JoinLobbyScreen.prototype.cancel = function() {

};


function VictoryScreen(users, winners, ownIndex) {
	this._users = users;
	this._winners = winners;
	this._ownIndex = ownIndex;
}
VictoryScreen.prototype.display = function() {
	function returnToHome(event) {
		displayScreen(new HomeScreen());
	};

	var self = this;
	console.log("winners: ");
	console.log(this._winners);
	console.log("users: ");
	console.log(this._users);
	$('#content').empty();
	$('#content').append(templates["victory"]({ }));
	self._winners.forEach(function(winner) {
		self._users.forEach(function(user) {
			if(user.index == winner) {
				$('#winner-list').append($('<li></li>').append($('<b></b>').text(user.summoner.displayName)));
			}
			if(self._ownIndex == winner && playSound) {
				var audio = new Audio("http://vignette3.wikia.nocookie.net" +
						"/leagueoflegends/images/4/46/Female1_OnVictory_1.ogg/" +
						"revision/latest?cb=20130506193735");
				audio.play();
			}
		});
	});
	$('#victory-button').click(returnToHome);
};
VictoryScreen.prototype.cancel = function() {

};


function SelectSummonerScreen(follow) {
	this._follow = follow;
}
SelectSummonerScreen.prototype.display = function() {
	var self = this;
	function summonerSubmit(event) {
		var summoner_name = $("#input-summoner-name").val();
		var platform = $("#select-platform").val();

		$("#btn-submit").prepend(templates["loading-button"]({ }));
		$("#btn-submit").prop("disabled", true);

		$.post({
			url: '/backend/portal/select-summoner',
			data: JSON.stringify({
				summonerName: summoner_name,
				platform: platform
			}),
			success: function(data) {
				localStorage.setItem("summonerName", summoner_name);
				localStorage.setItem("platform", platform);
				if(self._follow.returnToLobby) {
					displayScreen(new LobbyScreen(self._follow.returnToLobby));
				}else{
					displayScreen(new HomeScreen());
				}
			},
			error: function(xhr) {
				if(xhr.status == 403 && xhr.responseJSON.error == 'summoner-not-found') {
					displayError({
						url: "api/select-summoner",
						httpStatus: xhr.status
					});
					$(".center", "#btn-submit").remove();
					$("#btn-submit").prop("disabled", false);
				}else{
					displayError({
						url: "api/select-summoner",
						httpStatus: xhr.status
					});
				}
			},
			contentType: 'application/json'
		});
		
		event.preventDefault();
	};

	$('#content').empty();
	$('#content').append(templates["summoner-select"]({ }));
	$("#submit").submit(summonerSubmit);
	if(localStorage.getItem("summonerName") && localStorage.getItem("platform")) {
		$('#input-summoner-name').val(localStorage.getItem("summonerName"));
		$('#select-platform').val(localStorage.getItem("platform"));
	}
};
SelectSummonerScreen.prototype.cancel = function() {

};


function PlaySoloScreen() {

}
PlaySoloScreen.prototype.display = function() {

};
PlaySoloScreen.prototype.cancel = function() {

};


function PlayPartyScreen() {

}
PlayPartyScreen.prototype.display = function() {

};
PlayPartyScreen.prototype.cancel = function() {

};

function switchSite(state) {
	switch(state.site) {
	case 'portal':
		displayScreen(new HomeScreen());
		break;
	case 'lobby':
		displayScreen(new LobbyScreen(state.lobbyId));
		break;
	default:
		// TODO: replace this by a user-visible error message
		throw new Error("Unexpected data-site");
	}
}

function describeState(state) {
	switch(state.site) {
	case 'portal':
		return {
			url: '/',
			title: 'Guess my main!',
		};
	case 'lobby':
		return {
			url: '/' + state.lobbyId,
			title: 'Guess my main!',
		};
	default:
		throw new Error("No such state!");
	}
}

function refreshTo(state) {
	var desc = describeState(state);
	
	window.history.replaceState(state, desc.title, desc.url);
	switchSite(state);
}

function navigateTo(state) {
	var desc = describeState(state);
	
	window.history.pushState(state, desc.title, desc.url);
	switchSite(state);
}

window.onpopstate = function(event) {
	switchSite(event.state);
};

$(document).ready(function() {
	frontendUrl = $('html').data('frontendUrl');

	var state = {
		site: $('html').data('site'),
		lobbyId: $('html').data('lobbyId')
	};
	var desc = describeState(state);

	window.history.replaceState(state, desc.title, desc.url);
	switchSite(state);
});

