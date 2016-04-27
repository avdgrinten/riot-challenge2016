
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

function getTemplate() {
	$.get({
		url: '/dynamic/portal',
		dataType: "json",
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

				$("#button-solo").click(function(event) {
					$.post({
						url: '/api/play-solo',
						dataType: "json",
						success: (data) => {

						},
						error: (xhr, status, error) => {
							console.error("Could not retrieve api/play-solo");
							console.error("Status:", status);
							console.error(error);
						}
					});
				});

				$("#button-party").click(function(event) {
					$.post({
						url: '/api/play-party',
						dataType: "json",
						success: (data) => {
							console.log(data);
							if(data.state == "lobby-select"){
								$('#content').empty();
								$('#content').append(templates["lobby-select"]({ myself: data.user }));
								$("#clipboard-button").mouseenter(function(event) {
									$("#clipboard-button").tooltip("show");
								});

								$("#clipboard-button").mouseleave(function(event) {
									$("#clipboard-button").tooltip("hide");
								});

								$("#clipboard-button").click(function(event) {
									$(".lobby-link").select();
									try {
										document.execCommand('copy');
									} catch (err) {
										console.log("Unable to copy link!");
									}
								});
							}
						},
						error: (xhr, status, error) => {
							console.error("Could not retrieve api/play-party");
							console.error("Status:", status);
							console.error(error);
						}
					});
				});
			}
		},
		error: (xhr, status, error) => {
			console.error("Could not retrieve /dynamic/portal");
			console.error("Status:", status);
			console.error(error);
		}
	});
}

$(document).ready(function() {
	console.log( "ready!" );

	pollAgain();
	getTemplate();
});
