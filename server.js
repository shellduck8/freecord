const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const readline = require("readline");
const path = require("path");
const fs = require("fs");
const record = require("node-record-lpcm16");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const { spawn } = require('child_process');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let users = {}; // Store connected users
let recordingStream = null;
let recordingFile = null;
let soxProcess = null;

function logConnectedUsers() {
    console.log("Connected users:");
    console.table(Object.entries(users).map(([id, user]) => ({ userId: id, username: user.username })));
}

function broadcastUsers() {
    const usernames = Object.values(users).map(user => user.username);
    broadcastMessage({ type: "updateUsers", users: usernames });
}

function broadcastMessage(message) {
    Object.values(users).forEach(user => user.ws.send(JSON.stringify(message)));
}

wss.on("connection", (ws, req) => {
    const userId = req.socket.remoteAddress; // Use IP address as userId

    ws.on("message", (message) => {
        const data = JSON.parse(message);

        if (data.type === "join") {
            users[userId] = { ws, username: data.username };
            console.log(`User joined: ${data.username} (ID: ${userId})`);
            logConnectedUsers();
            broadcastUsers();
            notifyExistingUsers(userId); // Tell existing users to connect to the new user
        } else if (data.type === "leave") {
            console.log(`User left: ${users[userId].username} (ID: ${userId})`);
            delete users[userId];
            logConnectedUsers();
            broadcastUsers();
        } else if (data.type === "offer" || data.type === "answer" || data.type === "ice-candidate") {
            sendToUser(data.receiver, { ...data, sender: userId });
        } else if (data.type === "speaking") {
            broadcastMessage({ type: "speaking", username: data.username, speaking: data.speaking });
        } else if (data.type === "chat") {
            broadcastMessage({ type: "chat", username: data.username, message: data.message });
        }
    });

    ws.on("close", () => {
        if (users[userId]) {
            console.log(`User left: ${users[userId].username} (ID: ${userId})`);
            delete users[userId];
            logConnectedUsers();
            broadcastUsers();
        }
    });

    function sendToUser(receiver, message) {
        if (users[receiver]) {
            users[receiver].ws.send(JSON.stringify(message));
        }
    }

    function notifyExistingUsers(newUserId) {
        Object.keys(users).forEach(existingUserId => {
            if (existingUserId !== newUserId) {
                sendToUser(existingUserId, { type: "offer-request", sender: newUserId });
            }
        });
    }
});

// Admin CLI
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on("line", (input) => {
    const [command, ...args] = input.split(" ");
    if (command === "users") {
        console.log("Connected users:");
        console.table(Object.entries(users).map(([id, user]) => ({ userId: id, username: user.username })));
    } 
    else if (command === "getUserId") {
        const username = args.join(" ");
        const user = Object.entries(users).find(([id, user]) => user.username === username);
        if (user) {
            console.log(`User ID for ${username}: ${user[0]}`);
        } else {
            console.log(`User ${username} not found.`);
        }
    }
    else if (command === "kick") {
        const identifier = args.join(" ");
        const user = Object.entries(users).find(([id, user]) => user.username === identifier || id === identifier);
        if (user) {
            const [userId, userInfo] = user;
            userInfo.ws.send(JSON.stringify({ type: "kick" }));
            userInfo.ws.close();
            delete users[userId];
            console.log(`User ${userInfo.username} (ID: ${userId}) has been kicked.`);
            logConnectedUsers();
            broadcastUsers();
        } else {
            console.log(`User ${identifier} not found.`);
        }
    }
    else if (command === "record" && args[0] === "start") {
        startRecording();
    }
    else if (command === "record" && args[0] === "stop") {
        stopRecording();
    }
    else if (command === "stop") {
        console.log("Stopping server...");
        process.exit(0);
    }
    else if (command === "adminmsg") {
        const message = args.join(" ");
        broadcastMessage({ type: "chat", username: "Admin", message, isAdmin: true });
    }
    else {
        console.log("Unknown command");
    }
});

function startRecording() {
    if (soxProcess) {
        console.log("Recording is already in progress.");
        return;
    }

    const outputFilePath = path.join(__dirname, "servermedia", "recordings", `recording_${Date.now()}.wav`);
    const soxArgs = [
        '-d', // Use the default audio device
        '--no-show-progress',
        '--rate', '44100',
        '--channels', '2',
        '--encoding', 'signed-integer',
        '--bits', '16',
        '--type', 'wav',
        outputFilePath
    ];

    soxProcess = spawn('sox', soxArgs);

    soxProcess.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
    });

    soxProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    soxProcess.on('close', (code) => {
        console.log(`sox process exited with code ${code}`);
        soxProcess = null;
    });
    console.log("Recording started.");
}

function stopRecording() {
    if (!soxProcess) {
        console.log("No recording in progress.");
        return;
    }

    soxProcess.kill('SIGINT');
    soxProcess = null;

    console.log("Recording stopped.");
}

app.use(express.static("public"));

server.listen(3000, () => {
    console.log("Server is listening on port 3000");
});
