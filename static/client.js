
function displayError(error) {
	$('#content').prepend(templates["alert"]({ 
		error: error
	}));
}

function displayPortal() {
	function summonerSubmit(event) {
		var summoner_name = $("#input-summoner-name").val();
		var platform = $("#select-platform").val();

		$("#btn-submit").prepend(templates["loading"]({ 
			size: "fa-lg"
		}));
		$("#btn-submit").prop("disabled",true);

		$.post({
			url: '/backend/portal/select-summoner',
			data: JSON.stringify({
				summonerName: summoner_name,
				platform: platform
			}),
			success: (data) => {
				navigateTo({
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
		$("#button-solo").prepend(templates["loading"]({ 
			size: "fa-lg"
		}));
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
		$("#button-party").prepend(templates["loading"]({ 
			size: "fa-lg"
		}));
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
		$("#button-switch-summoner").prepend(templates["loading"]({ 
			size: "fa-lg"
		}));
		$("#button-switch-summoner").prop("disabled",true);
	};

	$('#content').empty().prepend(templates["loading"]({ }));

	$.get({
		url: '/backend/portal/site',
		dataType: 'json',
		success: (data) => {
			if(data.state == "summoner-select") {
				$('#content').empty();
				$('#content').append(templates["summoner-select"]({ }));
				$("#submit").submit(summonerSubmit);
				if(localStorage.getItem("summonerName") && localStorage.getItem("platform")) {
					$('#input-summoner-name').val(localStorage.getItem("summonerName"));
					$('#select-platform').val(localStorage.getItem("platform"));
				}
			}else if(data.state == "summoner-home"){
				$('#content').empty();
				$('#content').append(templates["summoner-home"]({ }));

				$('.header-content').empty();
				$('.header-content').append(templates["header-content"]({
					myself: data.user
				}));

				$("#button-switch-summoner").click(switchSummoner);
				$("#button-solo").click(playSoloClick);
				$("#button-party").click(playPartyClick);
			}
		},
		error: function(xhr) {
			displayError({
				url: "/backend/portal/site",
				httpStatus: xhr.status
			});
		}
	});
}

function displayLobby(lobby_id) {
	let sequence_id = 0;

	function pollUpdates() {
		$.post({
			url: '/backend/lobby/' + lobby_id + '/updates?sequenceId=' + sequence_id,
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
		$.post({
			url: '/backend/lobby/' + lobby_id + '/lock-answer',
			data: JSON.stringify({
				answer: {
					championId: $(event.currentTarget).data('champion')
				}
			}),
			contentType: 'application/json',
			success: (data) => {
				console.log(data);
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
		if(type == 'question') {
			var source = templates['question']({
				mastered: data.mastered,
				choices: data.choices
			});
			var dom = $($.parseHTML(source));
			$('.lock-answer', dom).on('click', answerClick);
			$('#question-area').empty().append(dom);
		}else{
			displayError({
				message: "Ouch, the server gave us a response we don't understand.",
				details: "Illegal update information"
			});
		}
	}

	$('#content').empty().prepend(templates["loading"]({ }));
	$.get({
		url: '/backend/lobby/' + lobby_id + '/site',
		dataType: "json",
		success: data => {
			if(data.state == 'lobby-select') {
				var source = templates['lobby-select']({
					myself: data.user
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
					details: "Illegal .state"
				});
			}
		},
		error: function(xhr) {
			displayError({
				url: "/backend/lobby/{lobbyId}/site",
				httpStatus: xhr.status
			});
		}
	});
}

function switchSite(state) {
	console.log("switchSite");
	console.log(state);
	switch(state.site) {
	case 'portal':
		displayPortal();
		break;
	case 'lobby':
		displayLobby(state.lobbyId);
		break;
	default:
		// TODO: replace this by a user-visible error message
		throw new Error("Unexpected data-site");
	}
}

function navigateTo(state) {
	console.log("navigateTo");
	console.log(state);
	var url;
	if(state.site == 'portal') {
		url = "/";
	}else if(state.site == 'lobby'){
		url = "/" + state.lobbyId;
	}else{
		throw new Error("No such state!");
	}
	window.history.pushState(state, "Guess my main!", url);
	switchSite(state);
}

window.onpopstate = function(event) {
	console.log("onpopstate");
	console.log(event.state);
	switchSite(event.state);
};

$(document).ready(function() {
	switchSite({
		site: $('html').data('site'),
		lobbyId: $('html').data('lobbyId')
	});
});
