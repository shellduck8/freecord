# FreeCord

![FreeCord Logo](public/media/favicon.ico)

FreeCord is a Discord-like voice and text chat application that allows users to join voice channels, send text messages, and use a soundboard. This project is built using Node.js, Express, WebSocket, and WebRTC.

## Features

- **Voice Chat**: Communicate with others using WebRTC.
- **Text Chat**: Send and receive messages in real-time using WebSocket.
- **Soundboard**: Play audio files locally with sleek buttons.
- **Admin CLI**: Manage users, send admin messages, and record voice chat.
- **Recording**: Save voice chat as MP3 files for later use.
- **Logs**: Maintain a log of user activity and chat messages.

## Prerequisites

- [Node.js](https://nodejs.org/) and npm installed
- [ngrok](https://ngrok.com/) for exposing your local server to the internet

## Getting Started

### Clone the Repository

```sh
git clone https://github.com/your-username/discordclone.git
cd discordclone
```

### Install Dependencies

```sh
npm install
```

### Set Up ngrok

1. Download and install ngrok from [ngrok.com](https://ngrok.com/).
2. Start ngrok to expose your local server:

```sh
ngrok http 3000
```

3. Copy the HTTPS URL provided by ngrok (e.g., `https://d79f-84-199-37-243.ngrok-free.app`).

### Configure WebSocket URL

1. Open `public/js/config.js`.
2. Replace the `websocketUrl` value with your ngrok HTTPS URL:

```javascript
const config = {
    websocketUrl: "https://d79f-84-199-37-243.ngrok-free.app" // Replace with your ngrok URL
};
```

### Start the Server

```sh
node server.js
```

### Open the Application

1. Open your browser and navigate to your given link.
2. Enter a username and click "Join" to start using FreeCord.

## Admin CLI

The admin CLI allows you to manage users, send admin messages, and record voice chat. Here are the available commands:

- `users`: List all connected users.
- `getUserId <username>`: Get the user ID for a given username.
- `kick <username|userId>`: Kick a user by username or user ID.
- `record start`: Start recording the voice chat.
- `record stop`: Stop recording the voice chat and save the MP3 file in the `servermedia/recordings` folder.
- `adminmsg <message>`: Send a message as the admin in the text chat. Admin messages appear in red to distinguish them from regular users.
- `printlog`: Save the activity log (user joins, leaves, and chat messages) to `servermedia/log.txt`.
- `stop`: Stop the server.

## Project Structure

```
discordclone/
├── LICENSE
├── package.json
├── README.md
├── server.js
├── public/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── config.js
│   │   └── script.js
│   └── media/
│       └── favicon.ico
└── servermedia/
    ├── log.txt
    └── recordings/
```

## Logs

- All user activity (joins, leaves, and chat messages) is logged in memory and can be saved to `servermedia/log.txt` using the `printlog` command in the admin CLI.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## Acknowledgements

- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [WebSocket](https://www.npmjs.com/package/ws)
- [WebRTC](https://webrtc.org/)
- [ngrok](https://ngrok.com/)

---

Made by [shellduck8](https://github.com/shellduck8)
