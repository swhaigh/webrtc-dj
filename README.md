# WebRTC-DJ

This application acts as a very basic DJ-mixer that works in Chrome or Firefox browsers. The WebAudioAPI is used to decode MP3, Ogg, or PCM audio files and filter them through several kinds of AudioNodes in order to create a variety of effects. The resulting stream is hooked to an HTML5 audio element and played through the browser to the client's speakers.   

Any number of users can be connected to the application at once, and everyone can mix/play audio files in their browser without streaming the result. However, only one user can stream their mix at a time. If other users don't want to listen, they can mute/unmute the incoming stream or run the app locally.  

All server-side JavaScript is contained in index.js of the root directory. The client application HTML, CSS, and JavaScript are located in the public folder.    

You can run the application by connecting to the server on [Heroku](https://webrtc-dj.herokuapp.com)     
or locally with these commands from the root directory:  
>    npm install  
>    node index.js  

This installs the app's dependencies and starts running the server. The client application can now be opened at [localhost:5000](localhost:5000)  

WebRTC 
------  
This app originally started as a demo of WebRTC's peer-to-peer streaming capabilities. It uses the WebRTC MediaStream, RTCPeerConnection, and RTCDataChannel API's to establish peer connections and communicate between users. The server acts as a signalling channel between the application and the client, and stores a list of other currently connected users, or peers. Once Client A knows about Client B, the setup process to create a peer connection is as follows:  
	1. Client A creates a new RTCPeerConnection and uses it to create an offer.  
	2. Client A sets the offer description as its local description and sends it to Client B using the server.  
	3. Client B recieves the offer and creates a new RTCPeerConnection.  
	4. Client B sets the offer description as its remote description and uses the RTCPeerConnection to create an answer.  
	5. Client B sets the answer description as its local description and sends it to Client A using the server.  

In addition to creating the RTCPeerConnection, each client uses a protocol called Interactive Connectivity Establishment (ICE) in order to let peers know how they may be reached. Since clients often sit behind NAT routers, they typically can not be reached directly with a public IP address. Instead, clients use ICE to gather candidates, which consists of a public IP and a port, and send these candidates to their peers so that they may be reached publicly. The client does this by contacting a STUN server, which exists solely to relay these candidates back to the client. Google provides a free STUN server at stun.1.google.com:19302, which is used by the application.  

Once peers have established an RTCPeerConnection and exchanged their ICE candidates, they can communicate directly in real-time using the RTCDataChannel and the MediaStream interfaces. The RTCDataChannel can be used to send arbitrary data back and forth, while the MedisStream interface is used for audio/video streams.  

MIT License:  
http://opensource.org/licenses/MIT