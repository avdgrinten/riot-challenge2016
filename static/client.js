
var frontendUrl;

function displayError(error) {
	$('#notifications').prepend(templates["alert"]({ 
		error: error
	}));
}

var currentScreen = null;

function displayScreen(screen) {
	if(currentScreen)
		currentScreen.cancel();
	currentScreen = screen;
	screen.display();
}

function PortalScreen() {

}
PortalScreen.prototype.display = function() {
	function summonerSubmit(event) {
		var summoner_name = $("#input-summoner-name").val();
		var platform = $("#select-platform").val();

		$("#btn-submit").prepend(templates["loading-button"]({ }));
		$("#btn-submit").prop("disabled",true);

		$.post({
			url: '/backend/portal/select-summoner',
			data: JSON.stringify({
				summonerName: summoner_name,
				platform: platform
			}),
			success: (data) => {
				refreshTo({
					site: "portal"
				});
				localStorage.setItem("summonerName", summoner_name);
				localStorage.setItem("platform", platform);
			},
			error: function(xhr) {
				displayError({
					url: "api/select-summoner",
					httpStatus: xhr.status
				});
			},
			contentType: 'application/json'
		});
		
		event.preventDefault();
	}

	function playSoloClick(event) {
		$("#button-solo").prepend(templates["loading-button"]({ }));
		$("#button-solo").prop("disabled",true);


		$.post({
			url: '/backend/portal/play-solo',
			dataType: 'json',
			success: (data) => {
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
		$("#button-party").prop("disabled",true);

		$.post({
			url: '/backend/portal/play-party',
			dataType: 'json',
			success: (data) => {
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
		$("#button-switch-summoner").prop("disabled",true);
	};

	$('#content').empty().prepend(templates["loading-page"]({ }));

	$.get({
		url: '/backend/portal/site',
		dataType: 'json',
		success: (data) => {
			if(data.state == "summoner-home"){
				$('#content').empty();
				$('#content').append(templates["summoner-home"]({ 
					myself: data.user
				}));

				$('.header-content').empty();
				$('.header-content').append(templates["header-content"]({
					myself: data.user
				}));

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
				$('#content').empty();
				$('#content').append(templates["summoner-select"]({ }));
				$("#submit").submit(summonerSubmit);
				if(localStorage.getItem("summonerName") && localStorage.getItem("platform")) {
					$('#input-summoner-name').val(localStorage.getItem("summonerName"));
					$('#select-platform').val(localStorage.getItem("platform"));
				}
			}else{
				displayError({
					url: "/backend/portal/site",
					httpStatus: xhr.status
				});
			}
		}
	});
};
PortalScreen.prototype.cancel = function() {

};

function LobbyScreen(lobby_id) {
	this.lobbyId = lobby_id;
}
LobbyScreen.prototype.display = function() {
	var self = this;
	var sequence_id = 0;

	function pollUpdates() {
		$.post({
			url: '/backend/lobby/' + self.lobbyId + '/updates?sequenceId=' + sequence_id,
			dataType: "json",
			success: (data) => {
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

	function answerClick(event) {
		$(this).append(templates['loading-pick']({ }));
		$('.lock-answer').attr('disabled', 'disabled');
		$.post({
			url: '/backend/lobby/' + self.lobbyId + '/lock-answer',
			data: JSON.stringify({
				answer: {
					championId: $(this).data('champion')
				}
			}),
			contentType: 'application/json',
			success: (data) => {
				$(event.currentTarget).addClass('locked-pick');
				$(".loading-pick", this).remove();
			},
			error: function(xhr) {
				displayError({
					url: "/backend/lobby/{lobbyId}/lock-answer",
					httpStatus: xhr.status
				});
			}
		});
	}

	function displayUpdate(type, data) {
		if(type == 'round') {
			var source = templates['question']({
				round: data.round,
				numRounds: data.numRounds,
				mastered: data.question.mastered,
				choices: data.question.choices
			});
			var dom = $($.parseHTML(source));
			$('.lock-answer', dom).on('click', answerClick);
			$('#question-area').empty().append(dom);
		}else if(type == 'join-user'){
			$('#summoner-list').append(templates["summoner"]({
				index: data.index,
				summoner: data.user
			}));
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
			console.log(data);
			data.forEach(function(entry) {
				$('.summoner[data-index=' + entry.index + '] .score').text(entry.score);
			});
		}else{
			displayError({
				message: "Ouch, the server gave us a response we don't understand.",
				details: "Illegal update information",
				data: type
			});
		}
	}

	$('#content').empty().prepend(templates["loading-page"]({ }));
	$.get({
		url: '/backend/lobby/' + self.lobbyId + '/site',
		dataType: "json",
		success: data => {
			if(data.state == 'lobby-select') {
				var state = describeState({
					site: "lobby",
					lobbyId: self.lobbyId
				});

				var source = templates['lobby-select']({
					shareUrl: frontendUrl + state.url
				});

				var dom = $($.parseHTML(source));
				
				$("#clipboard-button", dom)
				.tooltip()
				.click(function(event) {
					$(".lobby-link", dom).select();
					try {
						document.execCommand('copy');
					} catch (err) {
						console.log("Unable to copy link!");
					}
				});

				$('#content').empty().append(dom);
			}else if(data.state == 'active-game') {
				var source = templates['active-game']({
					myself: data.user
				});
				var dom = $($.parseHTML(source));
				
				$('#content').empty().append(dom);

				pollUpdates();
			}else{
				displayError({
					message: "Ouch, the server gave us a response we don't understand.",
					details: "Illegal state",
					data: data.state
				});
			}
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
LobbyScreen.prototype.cancel = function() {

};

function switchSite(state) {
	switch(state.site) {
	case 'portal':
		displayScreen(new PortalScreen());
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

