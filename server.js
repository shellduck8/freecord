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
var log = "";

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let users = {}; // Store connected users
let recordingStream = null;
let recordingFile = null;
let soxProcess = null;

function generateUserId() {
    return Math.random().toString(36).substr(2, 9);
}

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

wss.on("connection", (ws) => {
    const userId = generateUserId(); // Generate a random user ID

    ws.on("message", (message) => {
        try{
            const data = JSON.parse(message);
        if (data.type === "join") {
            users[userId] = { ws, username: data.username };
            console.log(`User joined: ${data.username} (ID: ${userId})`);
            log += `User joined: ${data.username} (ID: ${userId})\n`; // Add to log
            logConnectedUsers();
            broadcastUsers();
        } else if (data.type === "offer" || data.type === "answer" || data.type === "ice-candidate") {
            // Relay signaling messages to the intended receiver
            if (users[data.receiver]) {
                users[data.receiver].ws.send(JSON.stringify({ ...data, sender: userId }));
            }
        } else if (data.type === "leave") {
            console.log(`User left: ${users[userId].username} (ID: ${userId})`);
            log += `User left: ${users[userId].username} (ID: ${userId})\n`; // Add to log
            delete users[userId];
            logConnectedUsers();
            broadcastUsers();
        } else if (data.type === "chat") {
            console.log(`[CHAT] ${data.username}: ${data.message}`);
            log += `[CHAT] ${data.username}: ${data.message}\n`;
            broadcastMessage({ type: "chat", username: users[userId].username, message: data.message });
        } else if (data.type === "audio") {
            if (recordingStream) {
                recordingStream.write(data.audio);
            }
        } else if (data.type === "startRecording") {
            const outputFilePath = path.join(__dirname, "servermedia", "recordings", `recording_${Date.now()}.wav`);
            recordingStream = fs.createWriteStream(outputFilePath);
            recordingFile = outputFilePath;
            console.log("Recording started.");
            log += "Recording started.\n"; // Add to log
        } else if (data.type === "stopRecording") {
            if (recordingStream) {
                recordingStream.end();
                recordingStream = null;
                console.log("Recording stopped.");
                log += "Recording stopped.\n"; // Add to log
                // Convert the recording to MP3 format
                ffmpeg()
                    .input(recordingFile)
                    .output(path.join(__dirname, "servermedia", "recordings", `recording_${Date.now()}.mp3`))
                    .on("end", () => {
                        console.log("Recording converted to MP3.");
                        log += "Recording converted to MP3.\n"; // Add to log
                    })
                    .on("error", (error) => {
                        console.error("Error converting recording to MP3:", error);
                    })
                    .run();
            }
        }
    } catch(error){
        console.error("Error parsing JSON message", error);
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
        const message = args.join(" ").trim();
        if (!message) {
            console.log("Error: Message cannot be empty.");
            return;
        }
        broadcastMessage({ type: "chat", username: "Admin", message, isAdmin: true });
        console.log(`[ADMIN] ${message}`);
        log += `[ADMIN] ${message}\n`; // Add to log
    }
    else if (command === "printlog") {
        const logFilePath = path.join(__dirname, "servermedia", "log.txt");
        fs.writeFile(logFilePath, log, function(err) {
            if (err) {
                console.log(err);
            } else {
                console.log("The log file was saved!");
            }
        });
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

app.use(express.static("public"));

server.listen(3000, () => {
    console.log("Server is listening on port 3000");
});
