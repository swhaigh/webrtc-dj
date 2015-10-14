var socket = io();
var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var mediaStreamDest = audioCtx.createMediaStreamDestination();

var config  = { iceServers: [ { url: 'stun:stun.l.google.com:19302' } ] };
var options = { optional: [ { RtpDataChannels: true } ] };

var peers = {};
var candidates = {};

var playing = false;
var playing2 = false;
var streaming = false;
var my_stream = false;
var started = false;
var muted = false;
var count = 0;

var source;
var source2;
var draw;
var draw2;
var myId;

var streamBtn   = document.getElementById('streamBtn');
var stopStream  = document.getElementById('stopStream');
var muteBtn		= document.getElementById('muteBtn');
var unmuteBtn	= document.getElementById('unmuteBtn');

var audioPlayer = document.getElementById('audioPlayer');
var streamPlayer= document.getElementById('streamPlayer');
var counter 	= document.getElementById('counter');
var stream_msg  = document.getElementById('stream_msg');

var fileInput   = document.getElementById('fileInput');
var playBtn		= document.getElementById('playBtn');
var stopBtn 	= document.getElementById('stopBtn');
var canvas      = document.getElementById('v1');

var fileInput2  = document.getElementById('fileInput2');
var playBtn2	= document.getElementById('playBtn2');
var stopBtn2	= document.getElementById('stopBtn2');
var canvas2     = document.getElementById('v2');

var	crossfader 	 = audioCtx.createGain();
var	gain         = audioCtx.createGain();
var	highpass     = audioCtx.createBiquadFilter();
var	lowpass      = audioCtx.createBiquadFilter();
var	panner       = audioCtx.createPanner();
var	analyser     = audioCtx.createAnalyser();

var	crossfader2	 = audioCtx.createGain();
var	gain2        = audioCtx.createGain();
var	highpass2    = audioCtx.createBiquadFilter();
var	lowpass2     = audioCtx.createBiquadFilter();
var	panner2      = audioCtx.createPanner();
var	analyser2    = audioCtx.createAnalyser();

socket.on('joined', function(msg) {
	// store unique id for this client
	myId = msg.id;

	// create new peer connection and data channel for each peer
	for (var i = 0; i < msg.peers.length; i++) {
		var peerId = msg.peers[i];

		peers[peerId] = createPeerConnection(peerId, true);
		var pc = peers[peerId].pc;

		// create offer for each peer
		createOffer(pc, peerId);
	}
});

socket.on('closed', function(id) {
	console.log('closing connection to ' + id);
	count--;
	$('#counter').html(count);

	if (peers.hasOwnProperty(id)) {
		peers[id].pc.close();
		peers[id].channel.close();
		delete peers[id];
	}
});

socket.on('offer', function(offer) {
	var peerId = offer.from;

	// create peer connection for incoming offer
	peers[peerId] = createPeerConnection(peerId, false);
	var pc = peers[peerId].pc;

	// set remote description and send answer
	pc.setRemoteDescription(new RTCSessionDescription(offer.desc), function() {

		// remote description set, so add queued candidates, if any
		if (candidates.hasOwnProperty(peerId)) {
			for (var i = 0; i < candidates[peerId].length; i++) {
				pc.addIceCandidate(new RTCIceCandidate(candidates[peerId][i]));
			}
		}

		// create answer, set local description, and send to offerer
		pc.createAnswer( function(localDesc) {
			pc.setLocalDescription(localDesc, function() {
				socket.emit('answer', {
					from: myId,
					to: peerId,
					desc: localDesc
				});
			});
		});
	});
});

socket.on('answer', function(answer) {
	var peerId = answer.from;
	peers[peerId].pc.setRemoteDescription(new RTCSessionDescription(answer.desc));
});

socket.on('candidate', function(msg) {
	var peerId = msg.from;

	// skip null candidates
	if (msg.candidate === null) return;

	// if peer connection not set up yet, save candidate for later.
	// otherwise, add it to existing peer connection
	if (!peers.hasOwnProperty(peerId)) {

		// create new array for peerId if this is first received candidate
		if (!candidates.hasOwnProperty(peerId)) {
			candidates[peerId] = [];
		}

		candidates[peerId].push(msg.candidate);
	} else {
		peers[peerId].pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
	}
});

socket.on('stop_stream', function() {
	streaming = false;
	$('#stream_msg').html('Nobody is streaming.');
	streamPlayer.pause();
});

// functions for setting up WebRTC peer connections
function createOffer(pc, peerId) {
	pc.createOffer( function(localDesc) {
		pc.setLocalDescription(localDesc, function() {
			socket.emit('offer', {
				from: myId,
				to: peerId,
				desc: localDesc
			});
		});
	});
};

function createPeerConnection(peerId, createChannel) {
	var newPc = new webkitRTCPeerConnection(config, options);
	newPc.onicecandidate = function(evt) {
		socket.emit('candidate', {
			from: myId,
			to: peerId,
			candidate: evt.candidate
		});
	};
	newPc.ondatachannel = function(evt) {
		if (peers[peerId].channel === null) {
			peers[peerId].channel = evt.channel;
			setChannelCallbacks(peers[peerId].channel, peerId);
		}
	};
	newPc.addStream(mediaStreamDest.stream);
	newPc.onaddstream = function(evt) {
		console.log('got stream!');
		peers[peerId].stream = evt.stream;
	};

	var newChannel = null;
	if (createChannel) {
		newChannel = newPc.createDataChannel('send', {});
		setChannelCallbacks(newChannel, peerId);
	}

	var peer = {
		pc: newPc,
		channel: newChannel
	};

	return peer;
};

function setChannelCallbacks(channel, peerId) {
	channel.onopen = function() {
		console.log('channel to ' + peerId + ' opened!');
		count++;
		$('#counter').html(count);
		if (my_stream) {
			channel.send( JSON.stringify({
				msg: 'play',
				from: myId
			}));
		}
	};
	channel.onmessage = function(evt) {
		var data = JSON.parse(evt.data);
		switch (data.msg) {
			case 'play':
				streaming = true;
				$('#stream_msg').html('Recieving stream...');
				streamPlayer.src = URL.createObjectURL(peers[data.from].stream);
				streamPlayer.play();
				break;
			case 'stop':
				streaming = false;
				$('#stream_msg').html('Nobody is streaming.');
				streamPlayer.pause();
		}
	};
	channel.onerror = function(evt) {
		console.log('error: ' + evt);
	};
};

function drawSpectrum() {
	var ctx = canvas.getContext('2d');
	var width = canvas.width;
	var height = canvas.height;
	var bar_width = 10;

	ctx.clearRect(0, 0, width, height);
	var freqByteData = new Uint8Array(analyser.frequencyBinCount);
	analyser.getByteFrequencyData(freqByteData);
	var barCount = Math.round(width / bar_width);
	for (var i = 0; i < barCount; i++) {
		var magnitude = freqByteData[i];
		ctx.fillRect(bar_width * i, height, bar_width - 2, -magnitude + 150);
	}
};

function drawSpectrum2() {
	var ctx = canvas2.getContext('2d');
	var width = canvas2.width;
	var height = canvas2.height;
	var bar_width = 10;

	ctx.clearRect(0, 0, width, height);
	var freqByteData = new Uint8Array(analyser2.frequencyBinCount);
	analyser2.getByteFrequencyData(freqByteData);
	var barCount = Math.round(width / bar_width);
	for (var i = 0; i < barCount; i++) {
		var magnitude = freqByteData[i];
		ctx.fillRect(bar_width * i, height, bar_width - 2, -magnitude + 150);
	}
};

stopBtn.onclick = function() {
	if (playing) {
		source.stop(0);
		source.disconnect();
		clearInterval(draw);
		playing = false;
		//console.log('track1 stopped');
	}
};

stopBtn2.onclick = function() {
	if (playing2) {
		source2.stop(0);
		source2.disconnect();
		clearInterval(draw2);
		playing2 = false;
		//console.log('track2 stopped');
	}
};

playBtn.onclick = function() {
	if (!playing) {
		playing = true;

		var reader = new FileReader();
		reader.onload = function() {
			audioCtx.decodeAudioData(reader.result, function(buffer) {
				source = audioCtx.createBufferSource();
				source.buffer = buffer;
				connectDeck1();

				audioPlayer.src = URL.createObjectURL(mediaStreamDest.stream);
	        	audioPlayer.play();	        	

	        	source.onended = finish;
	        	var time = audioCtx.currentTime + 0.100;
				source.start(time);
				draw = setInterval(drawSpectrum, 30);
			});
		};
		reader.readAsArrayBuffer(fileInput.files[0]);
		//console.log('play track1');
	}
};

function finish() {
	source.disconnect();
	clearInterval(draw);
	playing = false;
}

playBtn2.onclick = function() {
	if (!playing2) {
		playing2 = true;

		var reader = new FileReader();
		reader.onload = function() {
			audioCtx.decodeAudioData(reader.result, function(buffer) {
				source2 = audioCtx.createBufferSource();
				source2.buffer = buffer;
				connectDeck2();

				audioPlayer.src = URL.createObjectURL(mediaStreamDest.stream);
	        	audioPlayer.play();

	        	source2.onended = finish2;
	        	var time2 = audioCtx.currentTime + 0.100;
				source2.start(time2);
				draw2 = setInterval(drawSpectrum2, 30);
			});
		};
		reader.readAsArrayBuffer(fileInput2.files[0]);
		//console.log('play track2');
	}
};

function finish2() {
	source2.disconnect();
	clearInterval(draw);
	playing2 = false;
}

function connectDeck1() {
	highpass.type = 'highpass';
	highpass.frequency.value = 0;
	highpass.Q.value = 5;

	lowpass.type = 'lowpass';
	lowpass.frequency.value = 16000;
	lowpass.Q.value = 5;

	panner.setPosition(0,0,-1);
	analyser.smoothingTimeConstant = 0.85;
	analyser.fftSize = 128;
			
	source.connect(analyser);
	analyser.connect(gain);
	gain.connect(lowpass);
	lowpass.connect(highpass);
    highpass.connect(crossfader);
    crossfader.connect(panner);
    panner.connect(mediaStreamDest);
};

function connectDeck2() {
	highpass2.type = 'highpass';
	highpass2.frequency.value = 0;
	highpass2.Q.value = 5;

	lowpass2.type = 'lowpass';
	lowpass2.frequency.value = 16000;
	lowpass2.Q.value = 5;

	panner2.setPosition(0,0,-1);	
	analyser2.smoothingTimeConstant = 0.85;
	analyser2.fftSize = 128;

	source2.connect(analyser2);
	analyser2.connect(gain2);
	gain2.connect(lowpass2);
	lowpass2.connect(highpass2);
	highpass2.connect(crossfader2);
	crossfader2.connect(panner2);
	panner2.connect(mediaStreamDest);
};

muteBtn.onclick = function() {
	if (streaming) {
		streamPlayer.muted = true;
		muted = true;
		//console.log('mute stream');
	}
};

unmuteBtn.onclick = function() {
	if (muted) {
		streamPlayer.muted = false;
		muted = false;
		//console.log('unmute stream');
	}
};

streamBtn.onclick = function() {
	if (!streaming) {
		my_stream = true;
		socket.emit('stream_id', myId);

		$('#stream_msg').html("You're streaming!");
		for (peer in peers) {
			peers[peer].channel.send( JSON.stringify({
				msg: 'play',
				from: myId
			}));
		}
	}
};

stopStream.onclick = function() {
	if (my_stream) {
		my_stream = false;
		socket.emit('close_stream');

		$('#stream_msg').html('Nobody is streaming.');
		for (peer in peers) {
			peers[peer].channel.send( JSON.stringify({
				msg: 'stop',
				from: myId
			}));
		}
	}
};

function setVolume(fade_val) {
	var vol = 0;
	if (fade_val > 0) {
		vol = gain.gain.value * (1-fade_val);
		crossfader.gain.value = vol;
	} else if (fade_val < 0){
		vol = gain2.gain.value * (1+fade_val);
		crossfader2.gain.value = vol;
	}
};

$( "#crossfader" ).slider( {
    orientation: "horizontal",
    value: 0,
    min: -1,
    max: 1,
    step: 0.01,
    animate: true,
    slide :  function(event,ui) {
		//console.log('xfade val: ' + ui.value);
		setVolume(ui.value);
    }
});

$( "#master" ).slider( {
	orientation: "vertical",
	value: 1,
	min: 0,
	max: 1,	
	step: 0.01,
    animate: true,
    slide :  function(event,ui) {
		var vol = ui.value;
		//console.log('track1 vol: ' + vol);
		gain.gain.value = vol;
    }
});

$( "#master2" ).slider( {
	orientation: "vertical",	
    value: 1,
	min: 0,
	max: 1,	
	step: 0.01,
    animate: true,
    slide :  function(event,ui) {
		var vol = ui.value;
		//console.log('track2 vol: ' + vol);
		gain2.gain.value = vol;
    }
});

$( "#playback" ).slider( {
    orientation: "vertical",
    value: 1,
    min: 0,
    max: 2,
    step: 0.01,
    animate: true,
    slide :  function(event,ui) {
		//console.log('track1 speed: ' + ui.value);
		source.playbackRate.value = ui.value;
    }
});

$( "#playback2" ).slider( {
    orientation: "vertical",
    value: 1,
    min: 0,
    max: 2,
    step: 0.01,
    animate: true,
    slide :  function(event,ui) {
		//console.log('track2 speed: ' + ui.value);
		source2.playbackRate.value = ui.value;
    }
});

$( "#highpass" ).slider( {
    orientation: "vertical",
    value: 0,
    min: 0,
    max: 8000,
    step: 10,
    animate: true,
    slide :  function(event,ui) {
		//console.log('highpass freq: ' + ui.value);
		highpass.frequency.value = ui.value;
    }
});

$( "#highpass2" ).slider( {
    orientation: "vertical",
    value: 0,
    min: 0,
    max: 8000,
    step: 10,
    animate: true,
    slide :  function(event,ui) {
		//console.log('highpass2 freq: ' + ui.value);
		highpass2.frequency.value = ui.value;
    }
});

$( "#lowpass" ).slider( {
    orientation: "vertical",
    value: 16000,
    min: 0,
    max: 16000,
    step: 10,
    animate: true,
    slide :  function(event,ui) {
		//console.log('lowpass freq: ' + ui.value);
		lowpass.frequency.value = ui.value;
    }
});

$( "#lowpass2" ).slider( {
    orientation: "vertical",
    value: 16000,
    min: 0,
    max: 16000,
    step: 10,
    animate: true,
    slide :  function(event,ui) {
		//console.log('lowpass2 freq: ' + ui.value);
		lowpass2.frequency.value = ui.value;
    }
});

$( "#h1_Q" ).slider( {
    orientation: "vertical",
    value: 5,
    min: 0,
    max: 20,
    step: 1,
    animate: true,
    slide :  function(event,ui) {
		//console.log('highpass Q val: ' + ui.value);
		highpass.Q.value = ui.value;
    }
});

$( "#h2_Q" ).slider( {
    orientation: "vertical",
    value: 5,
    min: 0,
    max: 20,
    step: 1,
    animate: true,
    slide :  function(event,ui) {
		//console.log('highpass2 Q val: ' + ui.value);
		highpass2.Q.value = ui.value;
    }
});

$( "#l1_Q" ).slider( {
    orientation: "vertical",
    value: 5,
    min: 0,
    max: 20,
    step: 1,
    animate: true,
    slide :  function(event,ui) {
		//console.log('lowpass Q val: ' + ui.value);
		lowpass.Q.value = ui.value;
    }
});

$( "#l2_Q" ).slider( {
    orientation: "vertical",
    value: 5,
    min: 0,
    max: 20,
    step: 1,
    animate: true,
    slide :  function(event,ui) {
		//console.log('lowpass2 Q val: ' + ui.value);
		lowpass2.Q.value = ui.value;
    }
});

$( "#panner" ).slider( {
    orientation: "horizontal",
    value: 0,
    min: -4,
    max: 4,
    step: 0.1,
    animate: true,
    slide :  function(event,ui) {
		//console.log('pan val: ' + ui.value);
		panner.setPosition(ui.value,0,-1);
    }
});

$( "#panner2" ).slider( {
    orientation: "horizontal",
    value: 0,
    min: -4,
    max: 4,
    step: 0.1,
    animate: true,
    slide :  function(event,ui) {
		//console.log('pan2 val: ' + ui.value);
		panner2.setPosition(ui.value,0,-1);
    }
});

socket.emit('join');