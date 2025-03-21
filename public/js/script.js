document.addEventListener("DOMContentLoaded", () => {
    const socket = new WebSocket("https://1bc4-84-199-37-243.ngrok-free.app"); // Replace with your server URL
    const peerConnections = {};
    const configuration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
    let localStream;
    let username = "";
    let audioElements = [];
    let audioContext;
    let destination;
    let speaking = false;
    let usingSoundboard = false;
    let muted = false;

    socket.onopen = () => {
        console.log("WebSocket connection established");
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
        console.log("WebSocket connection closed");
    };

    async function getUserMedia() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error("Your browser does not support WebRTC. Please use a modern browser.");
            alert("Your browser does not support WebRTC. Please use a modern browser.");
            return;
        }

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Microphone access granted");
            console.log("Local stream:", localStream);
            detectSpeaking();
        } catch (error) {
            console.error("Microphone access denied", error);
            alert("Microphone access denied. Please allow microphone access and try again.");
        }
    }

    function detectSpeaking() {
        if (!localStream) {
            console.error("Local stream is not available");
            return;
        }

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(localStream);
        destination = audioContext.createMediaStreamDestination();
        const output = audioContext.createMediaStreamDestination();
        microphone.connect(analyser);
        analyser.connect(destination);
        analyser.connect(output);
        analyser.fftSize = 512;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function checkSpeaking() {
            analyser.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((a, b) => a + b, 0);
            const average = sum / dataArray.length;

            if (average > 10 && !speaking) {
                speaking = true;
                updateSpeakingStatus(username, true);
            } else if (average <= 10 && speaking) {
                speaking = false;
                updateSpeakingStatus(username, false);
            }
            requestAnimationFrame(checkSpeaking);
        }
        checkSpeaking();
    }

    document.getElementById("joinBtn").addEventListener("click", async () => {
        username = document.getElementById("username").value.trim();
        if (!username) return alert("Enter a username!");

        console.log("Joining with username:", username);
        await getUserMedia();
        if (localStream) {
            console.log("Sending join message");
            socket.send(JSON.stringify({ type: "join", username }));
        } else {
            console.error("Local stream is not available after getUserMedia");
        }
    });

    document.getElementById("leaveBtn").addEventListener("click", () => {
        console.log("Leaving the chat");
        socket.send(JSON.stringify({ type: "leave" }));
        for (const peer of Object.values(peerConnections)) {
            peer.close();
        }
        location.reload();
    });

    document.getElementById("muteBtn").addEventListener("click", () => {
        muted = !muted;
        if (muted) {
            document.getElementById("muteBtn").textContent = "Unmute";
            localStream.getTracks().forEach(track => track.enabled = false);
            audioElements.forEach(audio => audio.muted = true);
            socket.send(JSON.stringify({ type: "speaking", username, speaking: false }));
        } else {
            document.getElementById("muteBtn").textContent = "Mute";
            localStream.getTracks().forEach(track => track.enabled = true);
            audioElements.forEach(audio => audio.muted = false);
            if (speaking || usingSoundboard) {
                socket.send(JSON.stringify({ type: "speaking", username, speaking: true }));
            }
        }
    });

    socket.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log("Received message:", data);

            if (data.type === "updateUsers") {
                updateUserList(data.users);
            } else if (data.type === "chat") {
                addChatMessage(data.username, data.message, data.isAdmin);
            } else if (data.type === "offer") {
                await handleOffer(data.offer, data.sender);
            } else if (data.type === "answer") {
                await handleAnswer(data.answer, data.sender);
            } else if (data.type === "ice-candidate") {
                if (peerConnections[data.sender]) {
                    await peerConnections[data.sender].addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            } else if (data.type === "kick") {
                handleKick();
            } else {
                console.warn("Unknown message type:", data.type);
            }
        } catch (error) {
            console.error("Error processing WebSocket message:", error);
        }
    };

    function handleKick() {
        alert("You have been kicked from the chat.");
        socket.close();
        location.reload();
    }

    function updateUserList(users) {
        const userList = document.getElementById("userList");
        userList.innerHTML = "";
        users.forEach(user => {
            const userElement = document.createElement("div");
            userElement.id = `user-${user}`;
            userElement.textContent = user;
            userList.appendChild(userElement);
        });
    }

    function updateSpeakingStatus(username, speaking) {
        const userElement = document.getElementById(`user-${username}`);
        if (userElement) {
            if (speaking && usingSoundboard) {
                userElement.textContent = `${username} 🗣️📢`;
            } else if (speaking) {
                userElement.textContent = `${username} 🗣️`;
            } else if (usingSoundboard) {
                userElement.textContent = `${username} 📢`;
            } else {
                userElement.textContent = username;
            }
        }
    }

    async function createPeerConnection(remoteSocketId) {
        console.log("Creating peer connection for:", remoteSocketId);
        const peerConnection = new RTCPeerConnection(configuration);
        peerConnections[remoteSocketId] = peerConnection;

        // Add local stream tracks to the peer connection
        if (localStream) {
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        } else {
            console.error("Local stream is not available when creating peer connection");
        }

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("Sending ICE candidate");
                socket.send(JSON.stringify({
                    type: "ice-candidate",
                    candidate: event.candidate,
                    receiver: remoteSocketId
                }));
            }
        };

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log("Received remote track from:", remoteSocketId);
            let audio = document.getElementById(`audio-${remoteSocketId}`);
            if (!audio) {
                audio = document.createElement("audio");
                audio.id = `audio-${remoteSocketId}`;
                audio.autoplay = true;
                document.body.appendChild(audio);
            }
            audio.srcObject = event.streams[0];
        };

        return peerConnection;
    }

    async function handleOffer(offer, sender) {
        if (!offer || !offer.type) {
            console.error("Invalid offer received", offer);
            return;
        }

        console.log("Handling offer from:", sender);
        const peerConnection = await createPeerConnection(sender);

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            console.log("Remote description set");

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            console.log("Sending answer to:", sender);
            socket.send(JSON.stringify({
                type: "answer",
                answer: peerConnection.localDescription,
                receiver: sender
            }));
        } catch (error) {
            console.error("Error handling offer:", error);
        }
    }

    async function handleAnswer(answer, sender) {
        console.log("Handling answer from:", sender);
        if (peerConnections[sender]) {
            await peerConnections[sender].setRemoteDescription(new RTCSessionDescription(answer));
        }
    }

    async function sendOfferToUser(remoteSocketId) {
        console.log("Sending offer to:", remoteSocketId);
        const peerConnection = await createPeerConnection(remoteSocketId);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.send(JSON.stringify({
            type: "offer",
            offer: offer,
            receiver: remoteSocketId
        }));
    }

    // Soundboard functionality
    document.getElementById("uploadAudio").addEventListener("change", (event) => {
        const files = event.target.files;
        const soundboard = document.getElementById("soundboard");

        for (const file of files) {
            const audioURL = URL.createObjectURL(file);
            const button = document.createElement("button");
            button.className = "soundboard-button";
            button.textContent = file.name;
            button.addEventListener("click", () => {
                const audio = new Audio(audioURL);
                const source = audioContext.createMediaElementSource(audio);
                source.connect(destination);
                source.connect(audioContext.destination); // Connect to local output
                audio.volume = document.getElementById("volumeSlider").value / 100;
                audio.play();
                audioElements.push(audio);
                usingSoundboard = true;
                updateSpeakingStatus(username, speaking);
                socket.send(JSON.stringify({ type: "speaking", username, speaking: true })); // Update speaking status
                audio.onended = () => {
                    usingSoundboard = false;
                    updateSpeakingStatus(username, speaking);
                    socket.send(JSON.stringify({ type: "speaking", username, speaking: false })); // Reset speaking status
                };
            });
            const soundboardItem = document.createElement("div");
            soundboardItem.className = "soundboard-item";
            soundboardItem.appendChild(button);
            soundboard.appendChild(soundboardItem);
        }
    });

    document.getElementById("volumeSlider").addEventListener("input", (event) => {
        const volume = event.target.value / 100;
        audioElements.forEach(audio => {
            audio.volume = volume;
        });
    });

    document.getElementById("stopSoundsBtn").addEventListener("click", () => {
        audioElements.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
        audioElements = [];
        usingSoundboard = false;
        updateSpeakingStatus(username, speaking);
        socket.send(JSON.stringify({ type: "speaking", username, speaking: false })); // Reset speaking status
    });

    // Text chat functionality
    document.getElementById("sendBtn").addEventListener("click", () => {
        const chatInput = document.getElementById("chatInput");
        const message = chatInput.value.trim();
        if (message) {
            socket.send(JSON.stringify({ type: "chat", username, message }));
            chatInput.value = ""; // Clear the input field
        }
    });

    document.getElementById("chatInput").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            const chatInput = document.getElementById("chatInput");
            const message = chatInput.value.trim();
            if (message) {
                socket.send(JSON.stringify({ type: "chat", username, message }));
                chatInput.value = ""; // Clear the input field
            }
        }
    });

    function addChatMessage(username, message, isAdmin = false) {
        const chatMessages = document.getElementById("chatMessages");
        const messageElement = document.createElement("div");
        if (isAdmin) {
            messageElement.innerHTML = `<span style="color: red; font-weight: bold;">ADMIN:</span> ${message}`;
        } else {
            messageElement.textContent = `${username}: ${message}`;
        }
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Scroll to the latest message
    }
});
