
function pollAgain() {
	$.post({
		url: 'api/poll/{{lobbyId}}',
		success: (data) => {
			console.log(data);

			pollAgain();
		},
		error: (xhr, status, error) => {
			console.error("Could not retrieve api/poll/:lobby endpoint");
			console.error("Status:", status);
			console.error(error);
		}
	});
}

function submit() {
	$.post({
		url: '/api/select-summoner',
		data: JSON.stringify({
			summonerName: $("#input-summoner-name").val(),
			platform: $("#select-platform").val()
		}),
		success: (data) => {
			console.log(data);
			window.location.reload();
		},
		error: (xhr, status, error) => {
			console.error("Could not retrieve api/select-summoner");
			console.error("Status:", status);
			console.error(error);
		},
		contentType: 'application/json'
	});
}

function displayPortal() {
	function playSoloClick(event) {
		$.post({
			url: '/api/play-solo',
			dataType: 'json',
			success: (data) => {

			},
			error: (xhr, status, error) => {
				console.error("Could not retrieve api/play-solo");
				console.error("Status:", status);
				console.error(error);
			}
		});
	}

	function playPartyClick(event) {
		$.post({
			url: '/api/play-party',
			dataType: 'json',
			success: (data) => {
				location.assign('/' + data.lobbyId);
			},
			error: (xhr, status, error) => {
				console.error("Could not retrieve api/play-party");
				console.error("Status:", status);
				console.error(error);
			}
		});
	}

	function switchSummoner(event) {
		
	};

	$.get({
		url: '/dynamic/portal',
		dataType: 'json',
		success: (data) => {
			console.log(data);
			if(data.state == "summoner-select") {
				$('#content').empty();
				$('#content').append(templates["summoner-select"]({ }));
				$("#submit").submit(function(event) {
					event.preventDefault();
					submit();
				});
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
		error: (xhr, status, error) => {
			console.error("Could not retrieve /dynamic/portal");
			console.error("Status:", status);
			console.error(error);
		}
	});
}

function displayLobby(lobby_id) {
	$.get({
		url: '/dynamic/lobby/' + lobby_id,
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
			}else{
				// TODO: replace this by a user-visible error message
				throw new Error("Unexpected data.state");
			}
		},
		error: (xhr, status, error) => {
			console.error("Could not retrieve /dynamic/lobby/:lobbyId");
			console.error("Status:", status);
			console.error(error);
		}
	});
}

$(document).ready(function() {
	//pollAgain();

	switch($('html').data('site')) {
	case 'portal':
		displayPortal();
		break;
	case 'lobby':
		displayLobby($('html').data('lobbyId'));
		break;
	default:
		// TODO: replace this by a user-visible error message
		throw new Error("Unexpected data-site");
	}
});
