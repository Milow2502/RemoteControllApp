# Remote Control App

A WebRTC-based remote control application that allows you to control your PC from a mobile device (phone/tablet) over the local network with low-latency screen streaming and touch-to-mouse translation.

## Features

- **Screen Sharing**: Stream your PC screen or specific application window to your mobile device via WebRTC.
- **Touch Control**:
  - 🖱️ **Single finger drag**: Smooth mouse cursor movement (~60fps)
  - 👆 **Single tap (< 400ms)**: Left click
  - ⏱️ **Long press (> 500ms)**: Right click
  - ✌️ **Two finger drag**: Smooth vertical scrolling
  - 🔘 **Floating Quick Bar**: Fullscreen mode, dedicated Right-click mode toggle, and reconnect button
- **Low Latency & High Responsiveness**: Direct peer-to-peer WebRTC connection with optimized 0ms mouse delay (`autoDelayMs: 0`).
- **Letterbox / Pillarbox Compensation**: Exact touch coordinate mapping regardless of phone/monitor aspect ratios and orientation.
- **Auto QR Code**: Built-in QR code on the host dashboard for instant connection without manual IP typing.
- **Cross-platform**: Works on Windows, macOS, Linux (server) and any device with a modern mobile browser (client).

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
| Signaling Server | `server.js` | Express + WebSocket server for WebRTC signaling, mouse injection, and input forwarding |
| Host Dashboard | `public/host.html` | PC screen capture, QR code generator, and WebRTC stream sender |
| Client Touchpad | `public/index.html` | Mobile video receiver and touch input gesture handler |
| Issues & Changelog | `CHANGELOG.md` | Detailed list of resolved issues, signaling fixes, and updates |

## Prerequisites

- Node.js 18+
- Modern browser with WebRTC support (Chrome, Firefox, Safari, Edge)
- Both devices on the same local network (Wi-Fi/LAN)

## Installation

```bash
# Clone the repository
git clone https://github.com/Milow2502/RemoteControllApp.git
cd RemoteControllApp

# Install dependencies
npm install
```

## Usage

### 1. Start the Server

```bash
npm start
```

The server will start on port 2000 and display the connection URLs:

```
==================================================
Сервер RemoteControlApp запущен на 0.0.0.0:2000
1. Откройте на ПК:    http://localhost:2000/host.html
2. Откройте на ТЕЛЕФОНЕ: http://192.168.1.XXX:2000
==================================================
```

### 2. Connect from PC (Host)

1. Open `http://localhost:2000/host.html` in a browser on your PC.
2. Click **"📹 Выбрать экран и начать трансляцию"** (Select screen and start streaming).
3. Select your screen or window in the browser's media dialog.

### 3. Connect from Mobile Device

1. Ensure your mobile device is connected to the same Wi-Fi network.
2. Scan the **QR code** displayed on `host.html` with your phone's camera, or open `http://<PC-IP>:2000` directly.
3. The video stream will connect automatically and touch controls will be active immediately!

## Touch Controls (Mobile)

| Gesture | Action |
|---------|--------|
| 1 finger drag | Move mouse cursor smoothly |
| Single tap (< 400ms) | Left click (LMB) |
| Long press (> 500ms) | Right click (RMB) |
| 2 fingers drag | Scroll up / down |
| Floating Action Bar | Fullscreen mode, Toggle RMB mode, Reconnect |

## Run Tests

```bash
npm test
```

## Issues & Changelog

See [`CHANGELOG.md`](./CHANGELOG.md) for detailed descriptions of resolved issues (WebRTC race conditions, video stream playback fixes, aspect ratio coordinate calculation, etc.).

## License

ISC