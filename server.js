const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { mouse, Point, Button, screen } = require('@nut-tree-fork/nut-js');
const path = require('path');
const os = require('os');

function createServer() {
    const app = express();
    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });

    app.use(express.static(path.join(__dirname, 'public')));

    // Nut-js configuration for instant responsiveness
    mouse.config.autoDelayMs = 0;
    mouse.config.mouseSpeed = 2000;

    let hostSocket = null;
    let mobileSocket = null;
    let isHostStreaming = false;

    wss.on('connection', (ws) => {
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);

                if (data.type === 'register') {
                    if (data.role === 'host') {
                        hostSocket = ws;
                        ws.role = 'host';
                        // Notify mobile that host is online
                        if (mobileSocket && mobileSocket.readyState === 1) {
                            mobileSocket.send(JSON.stringify({
                                type: 'host_status',
                                online: true,
                                streaming: isHostStreaming
                            }));
                        }
                    } else if (data.role === 'mobile') {
                        mobileSocket = ws;
                        ws.role = 'mobile';
                        // Send current host status to mobile
                        const hostOnline = !!(hostSocket && hostSocket.readyState === 1);
                        ws.send(JSON.stringify({
                            type: 'host_status',
                            online: hostOnline,
                            streaming: isHostStreaming
                        }));

                        // Notify host that mobile connected
                        if (hostOnline) {
                            hostSocket.send(JSON.stringify({
                                type: 'mobile_status',
                                online: true
                            }));
                        }
                    }
                    return;
                }

                // Host streaming state updates
                if (data.type === 'host_stream_status') {
                    if (ws === hostSocket) {
                        isHostStreaming = !!data.active;
                        if (mobileSocket && mobileSocket.readyState === 1) {
                            mobileSocket.send(JSON.stringify({
                                type: 'host_stream_status',
                                active: isHostStreaming
                            }));
                        }
                    }
                    return;
                }

                // Request stream from mobile to host
                if (data.type === 'request_stream') {
                    if (hostSocket && hostSocket.readyState === 1) {
                        hostSocket.send(JSON.stringify({ type: 'request_stream' }));
                    }
                    return;
                }

                // Forward WebRTC signaling between host and mobile
                if (['offer', 'answer', 'candidate'].includes(data.type)) {
                    if (ws === hostSocket && mobileSocket && mobileSocket.readyState === 1) {
                        mobileSocket.send(JSON.stringify(data));
                    } else if (ws === mobileSocket && hostSocket && hostSocket.readyState === 1) {
                        hostSocket.send(JSON.stringify(data));
                    }
                    return;
                }

                // Touch / Mouse input events from mobile to host
                if (data.type === 'input_move' || data.type === 'input_tap' || data.type === 'input_scroll') {
                    let screenWidth = data.screenWidth || 1920;
                    let screenHeight = data.screenHeight || 1080;

                    // Attempt to get OS desktop resolution if nut-js screen is available
                    try {
                        const w = await screen.width();
                        const h = await screen.height();
                        if (w && h) {
                            screenWidth = w;
                            screenHeight = h;
                        }
                    } catch {
                        // fallback to client-provided dimensions
                    }

                    const targetX = Math.max(0, Math.min(screenWidth - 1, Math.round(data.x * screenWidth)));
                    const targetY = Math.max(0, Math.min(screenHeight - 1, Math.round(data.y * screenHeight)));

                    try {
                        if (data.type === 'input_move') {
                            await mouse.setPosition(new Point(targetX, targetY));
                        } else if (data.type === 'input_tap') {
                            await mouse.setPosition(new Point(targetX, targetY));
                            await mouse.click(data.button === 'right' ? Button.RIGHT : Button.LEFT);
                        } else if (data.type === 'input_scroll') {
                            if (data.deltaY > 0) {
                                await mouse.scrollDown(Math.min(200, Math.abs(data.deltaY)));
                            } else {
                                await mouse.scrollUp(Math.min(200, Math.abs(data.deltaY)));
                            }
                        }
                    } catch (err) {
                        console.error('Ошибка обработки ввода:', err.message);
                    }
                }
            } catch (parseErr) {
                console.error('Ошибка парсинга WebSocket сообщения:', parseErr.message);
            }
        });

        ws.on('close', () => {
            if (ws === hostSocket) {
                hostSocket = null;
                isHostStreaming = false;
                if (mobileSocket && mobileSocket.readyState === 1) {
                    mobileSocket.send(JSON.stringify({
                        type: 'host_status',
                        online: false,
                        streaming: false
                    }));
                }
            } else if (ws === mobileSocket) {
                mobileSocket = null;
                if (hostSocket && hostSocket.readyState === 1) {
                    hostSocket.send(JSON.stringify({
                        type: 'mobile_status',
                        online: false
                    }));
                }
            }
        });
    });

    return { server, app, wss };
}

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    const candidates = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                candidates.push({ name, address: iface.address });
            }
        }
    }

    // Prefer private LAN ranges over VPN/CGNAT
    const preferred = candidates.find(c =>
        c.address.startsWith('192.168.') ||
        c.address.startsWith('10.') ||
        (c.address.startsWith('172.') && parseInt(c.address.split('.')[1]) >= 16 && parseInt(c.address.split('.')[1]) <= 31)
    );

    return preferred?.address || candidates[0]?.address || 'localhost';
}

function startServer(port = 2000, host = '0.0.0.0') {
    const { server } = createServer();
    server.listen(port, host, () => {
        const ip = getLocalIp();
        console.log(`\n==================================================`);
        console.log(`Сервер RemoteControlApp запущен на ${host}:${port}`);
        console.log(`1. Откройте на ПК:    http://localhost:${port}/host.html`);
        console.log(`2. Откройте на ТЕЛЕФОНЕ: http://${ip}:${port}`);
        console.log(`==================================================\n`);
    });
    return server;
}

module.exports = { getLocalIp, createServer, startServer };

// Only start server when run directly
if (require.main === module) {
    startServer();
}