# Remote Control App

A WebRTC-based remote control application that allows you to control your PC from a mobile device (phone/tablet) over the local network.

## Features

- **Screen Sharing**: Stream your PC screen to mobile device via WebRTC
- **Touch Control**: Mouse movement, left/right click, and scroll via touch gestures
- **Low Latency**: Direct peer-to-peer connection using WebRTC
- **Cross-platform**: Works on Windows, macOS, Linux (server) and any device with a modern browser (client)

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   PC (Host)     │ ◄─────────────────► │   Signaling     │
│  host.html      │     Server          │   Server        │
│  getDisplayMedia│                     │  (server.js)    │
└────────┬────────┘                     └────────┬────────┘
         │                                       │
         │ WebRTC PeerConnection                 │ WebSocket
         ▼                                       ▼
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   Mobile        │ ◄─────────────────► │   Mobile        │
│  index.html     │     Server          │  (Client)       │
│  Touch Input    │                     │                 │
└─────────────────┘                     └─────────────────┘
```

### Components

| Component | File | Description |
|-----------|------|-------------|
| Signaling Server | `server.js` | Express + WebSocket server for WebRTC signaling and input forwarding |
| Host Page | `public/host.html` | PC screen capture and WebRTC sender |
| Client Page | `public/index.html` | Mobile video receiver and touch input handler |

## Prerequisites

- Node.js 18+
- Modern browser with WebRTC support (Chrome, Firefox, Safari, Edge)
- Both devices on the same local network (Wi-Fi/LAN)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd RemoteControllApp

# Install dependencies
npm install
```

## Usage

### Start the Server

```bash
npm start
```

The server will start on port 2000 and display connection URLs:

```
Server listening on 0.0.0.0:2000
1. Open on PC: http://localhost:2000/host.html
2. Open on PHONE: http://192.168.1.XXX:2000
```

### Connect from PC (Host)

1. Open `http://localhost:2000/host.html` in a browser on your PC
2. Click **"Выбрать монитор и запустить"** (Select monitor and start)
3. Choose the screen/window to share in the browser's media picker dialog
4. The status will show "Трансляция активна. Подключитесь с телефона!"

### Connect from Mobile Device

1. Ensure mobile is on the same Wi-Fi network as PC
2. Open `http://<PC-IP>:2000` (e.g., `http://192.168.1.42:2000`) on mobile browser
3. The video stream should appear automatically

## Touch Controls (Mobile)

| Gesture | Action |
|---------|--------|
| Single finger drag | Move mouse cursor |
| Single tap (< 300ms) | Left click |
| Long press (> 500ms) | Right click |
| Two finger drag | Scroll |

## Network Configuration

### Firewall (Windows)

Allow Node.js through Windows Firewall:

```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "RemoteControlApp" -Direction Inbound -LocalPort 2000 -Protocol TCP -Action Allow
```

### Find PC IP Address

```bash
# Windows
ipconfig | findstr IPv4

# macOS/Linux
ifconfig | grep inet
```

## Development

### Project Structure

```
RemoteControllApp/
├── server.js           # Signaling + input server
├── package.json
├── public/
│   ├── host.html       # PC host page (screen sender)
│   └── index.html      # Mobile client page (video receiver)
├── tests/              # Test files
└── README.md
```

### Run Tests

```bash
npm test
```

### Add Custom STUN/TURN Servers

Edit the `iceServers` array in both HTML files:

```javascript
const pc = new RTCPeerConnection({
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:your-turn-server.com', username: 'user', credential: 'pass' }
    ]
});
```

## API Reference

### WebSocket Messages

#### Host → Server

```json
{ "type": "register", "role": "host" }
```

#### Mobile → Server

```json
{ "type": "register", "role": "mobile" }
```

#### WebRTC Signaling (bidirectional)

```json
{ "type": "offer", "offer": RTCSessionDescriptionInit }
{ "type": "answer", "answer": RTCSessionDescriptionInit, "screenWidth": 1920, "screenHeight": 1080 }
{ "type": "candidate", "candidate": RTCIceCandidateInit }
```

#### Input Events (Mobile → Server → Host)

```json
{ "type": "input_move", "x": 0.5, "y": 0.5, "screenWidth": 1920, "screenHeight": 1080 }
{ "type": "input_tap", "x": 0.5, "y": 0.5, "button": "left", "screenWidth": 1920, "screenHeight": 1080 }
{ "type": "input_scroll", "deltaY": -100 }
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot connect from phone" | Check firewall, ensure both on same network, verify PC IP |
| Black video on mobile | Browser blocked autoplay; tap video to play, or allow autoplay in settings |
| High latency | Use 5GHz Wi-Fi, reduce screen resolution in `getDisplayMedia` |
| Input not working | Verify WebSocket connection, check browser console for errors |
| Permission denied (screen share) | Allow screen recording permission in browser/OS settings |

## Security Notes

- **Local network only**: No authentication; anyone on the network can connect
- **No encryption** on WebSocket (use TURN over TLS for production)
- **Input injection**: Mouse/keyboard control runs with your user permissions

## License

ISC