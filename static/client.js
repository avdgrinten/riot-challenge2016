
var frontendUrl;

function displayError(error) {
	var dom = $.parseHTML(templates["alert"]({ 
		error: error
	}));

	$('#notifications').prepend(dom);
}

var currentState = null;
var playSound = false;

function displayState(state) {
	if(currentState)
		currentState.cancel();
	currentState = state;
	state.display();
}


function HomeState() {

}
HomeState.prototype.display = function() {
	function playSoloClick(event) {
		var dom = $.parseHTML(templates["loading-button"]());
		$("#button-solo").prepend(dom);
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
		var dom = $.parseHTML(templates["loading-button"]());
		$("#button-party").prepend(dom);
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
		var dom = $.parseHTML(templates["loading-button"]());
		$("#button-switch-summoner").prepend(dom);
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

	var dom = $.parseHTML(templates["loading-page"]());
	$('#content').empty().prepend(dom);

	$.get({
		url: '/backend/portal/site',
		dataType: 'json',
		success: function(data) {
			if(data.state == "summoner-home"){
				var dom = $.parseHTML(templates["summoner-home"]({ 
					myself: data.user
				}));
				$(dom).find("#button-solo").click(playSoloClick);
				$(dom).find("#button-party").click(playPartyClick);

				$('#content').empty();
				$('#content').append(dom);

				var dom = $.parseHTML(templates["header-summoner"]({
					myself: data.user
				}));
				$(dom).find("#button-switch-summoner").click(switchSummoner);

				$('.header-summoner').empty();
				$('.header-summoner').append(dom);
				$('#checkbox-sound').change(function(event) {
					playSound = event.currentTarget.checked;
				});
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
				displayState(new SelectSummonerState({ }));
			}else{
				displayError({
					url: "/backend/portal/site",
					httpStatus: xhr.status
				});
			}
		}
	});
};
HomeState.prototype.cancel = function() {

};


function LobbyState(lobby_id) {
	this._lobbyId = lobby_id;
	this._index = null;
	this._userList = [];
}
LobbyState.prototype.display = function() {
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

	function showVictoryScreen(users, winners, ownIndex) {
		function returnToHome(event) {
			displayState(new HomeState());
		};

		$('#lobby-content').empty();
		var dom = $.parseHTML(templates["victory"]());
		winners.forEach(function(winner) {
			users.forEach(function(user) {
				if(user.index == winner) {
					$(dom).find('#winner-list').append($('<li></li>').append($('<b></b>').text(user.summoner.displayName)));
				}
				if(ownIndex == winner && playSound) {
					var audio = new Audio("http://vignette3.wikia.nocookie.net" +
							"/leagueoflegends/images/4/46/Female1_OnVictory_1.ogg/" +
							"revision/latest?cb=20130506193735");
					audio.play();
				}
			});
		});
		$(dom).find('#victory-button').click(returnToHome);
		$('#lobby-content').append(dom);
	};

	function displayUpdate(type, data) {
		if(type == 'arrange-lobby') {
			var state = describeState({
				site: 'lobby',
				lobbyId: self._lobbyId
			});

			var dom = $.parseHTML(templates['arrange-lobby']({ 
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

			$('#lobby-content').empty().append(dom);
		}else if(type == 'start-game') {
		}else if(type == 'join-user') {
			var dom = $.parseHTML(templates["summoner"]({
				index: data.index,
				summoner: data.user
			}));
			$('#summoner-list').append(dom);

			var user = {
				index: data.index,
				summoner: data.user
			};
			self._userList.push(user);
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
			showVictoryScreen(self._userList, data.winners, self._index);
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
		var dom = $.parseHTML(templates['loading-pick']());
		$(this).append(dom);
		$('.lock-answer').attr('disabled', true);
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

	var dom = $.parseHTML(templates["loading-page"]());
	$('#content').empty().prepend(dom);
	$.get({
		url: '/backend/lobby/' + self._lobbyId + '/site',
		dataType: "json",
		success: function(data) {
			self._index = data.ownIndex;

			var dom = $.parseHTML(templates['lobby']());
			$('#content').empty().append(dom);

			pollUpdates();
		},
		error: function(xhr) {
			if(xhr.status == 403 && xhr.responseJSON.error == 'user-not-in-lobby') {
				displayState(new JoinLobbyState(self._lobbyId));
			}else if(xhr.status == 400 && xhr.responseJSON.error == 'user-required') {
				displayState(new SelectSummonerState({
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
LobbyState.prototype.cancel = function() {

};

function JoinLobbyState(lobby_id) {
	this._lobbyId = lobby_id;
}
JoinLobbyState.prototype.display = function() {
	var self = this;

	$.post({
		url: '/backend/lobby/' + self._lobbyId + '/join',
		dataType: "json",
		success: function(data) {
			displayState(new LobbyState(self._lobbyId));
		},
		error: function(xhr) {
			displayError({
				url: "/backend/lobby/{lobbyId}/site",
				httpStatus: xhr.status,
				data: JSON.stringify(xhr.responseJSON, null, 4)
			});
		}
	});
};
JoinLobbyState.prototype.cancel = function() {

};


function SelectSummonerState(follow) {
	this._follow = follow;
}
SelectSummonerState.prototype.display = function() {
	var self = this;
	function summonerSubmit(event) {
		var summoner_name = $("#input-summoner-name").val();
		var platform = $("#select-platform").val();

		var dom = $.parseHTML(templates["loading-button"]());
		$("#btn-submit").prepend(dom);
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
					displayState(new LobbyState(self._follow.returnToLobby));
				}else{
					displayState(new HomeState());
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
	var dom = $.parseHTML(templates["summoner-select"]());
	$(dom).find("#submit").submit(summonerSubmit);
	if(localStorage.getItem("summonerName") && localStorage.getItem("platform")) {
		$(dom).find('#input-summoner-name').val(localStorage.getItem("summonerName"));
		$(dom).find('#select-platform').val(localStorage.getItem("platform"));
	}
	$('#content').append(dom);
};
SelectSummonerState.prototype.cancel = function() {

};


function switchSite(state) {
	switch(state.site) {
	case 'portal':
		displayState(new HomeState());
		break;
	case 'lobby':
		displayState(new LobbyState(state.lobbyId));
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

