var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.use(express.static(__dirname + '/public'));

var peerQueues = { };
var stream_id = null;

io.on('connection', function(socket) {
	console.log('user ' + Object.keys(io.sockets.connected).length + ' connected');

	socket.on('disconnect', function() {
		if (stream_id == socket.id) {
			for (sock in io.sockets.connected) {
				io.sockets.connected[sock].emit('stop_stream');
			}
		}
		for (sock in io.sockets.connected) {
			io.sockets.connected[sock].emit('closed', socket.id);			
		}
	});

	socket.on('join', function() {
		peerQueues[socket.id] = 0;
		var peers = [];
		for (sock in io.sockets.connected) {
			if (socket.id !== sock) {
				peers.push(sock);
			}
		}
		socket.emit('joined', { "id": socket.id, "peers": peers });
	});

	socket.on('offer', function(offer) {
		io.sockets.connected[offer.to].emit('offer', offer);
	});

	socket.on('answer', function(answer) {
		io.sockets.connected[answer.to].emit('answer', answer);
	});

	socket.on('candidate', function(msg) {
		io.sockets.connected[msg.to].emit('candidate', msg);
	});

	socket.on('stream_id', function(id) {
		stream_id = id;
	});

	socket.on('close_stream', function() {
		stream_id = null;
	});
});

http.listen(process.env.PORT || 5000);