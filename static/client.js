
function pollAgain() {
	$.post({
		url: '/backend/lobby/{{lobbyId}}/poll',
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

function displayPortal() {
	function summonerSubmit(event) {
		var summoner_name = $("#input-summoner-name").val();
		var platform = $("#select-platform").val();
		$.post({
			url: '/backend/portal/select-summoner',
			data: JSON.stringify({
				summonerName: summoner_name,
				platform: platform
			}),
			success: (data) => {
				window.location.reload();
				localStorage.setItem("summonerName", summoner_name);
				localStorage.setItem("platform", platform);
			},
			error: (xhr, status, error) => {
				console.error("Could not retrieve api/select-summoner");
				console.error("Status:", status);
				console.error(error);
			},
			contentType: 'application/json'
		});
		
		event.preventDefault();
	}

	function playSoloClick(event) {
		$.post({
			url: '/backend/portal/play-solo',
			dataType: 'json',
			success: (data) => {
				location.assign('/' + data.lobbyId);
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
			url: '/backend/portal/play-party',
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
		error: (xhr, status, error) => {
			console.error("Could not retrieve /backend/portal/site");
			console.error("Status:", status);
			console.error(error);
		}
	});
}

function displayLobby(lobby_id) {
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
			}else{
				// TODO: replace this by a user-visible error message
				throw new Error("Unexpected data.state");
			}
		},
		error: (xhr, status, error) => {
			console.error("Could not retrieve /backend/lobby/{lobbyId}/site");
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
