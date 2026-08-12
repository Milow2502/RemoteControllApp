const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { mouse, Point, Button } = require('@nut-tree-fork/nut-js');
const path = require('path');
const os = require('os');

function createServer() {
    const app = express();
    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });

    app.use(express.static(path.join(__dirname, 'public')));

    mouse.config.mouseSpeed = 1000;

    let hostSocket = null;
    let mobileSocket = null;

    wss.on('connection', (ws) => {
        ws.on('message', async (message) => {
            const data = JSON.parse(message);

            if (data.type === 'register') {
                if (data.role === 'host') hostSocket = ws;
                if (data.role === 'mobile') mobileSocket = ws;
            }

            if (['offer', 'answer', 'candidate'].includes(data.type)) {
                if (ws === hostSocket && mobileSocket) mobileSocket.send(JSON.stringify(data));
                if (ws === mobileSocket && hostSocket) hostSocket.send(JSON.stringify(data));
            }

            if (data.type === 'input_move' || data.type === 'input_tap' || data.type === 'input_scroll') {
                const screenWidth = data.screenWidth || 1920;
                const screenHeight = data.screenHeight || 1080;
                const targetX = Math.round(data.x * screenWidth);
                const targetY = Math.round(data.y * screenHeight);

                try {
                    if (data.type === 'input_move') {
                        await mouse.setPosition(new Point(targetX, targetY));
                    } else if (data.type === 'input_tap') {
                        await mouse.setPosition(new Point(targetX, targetY));
                        await mouse.click(data.button === 'right' ? Button.RIGHT : Button.LEFT);
                    } else if (data.type === 'input_scroll') {
                        if (data.deltaY > 0) await mouse.scrollDown(100);
                        else await mouse.scrollUp(100);
                    }
                } catch (err) {
                    console.error('Ошибка ввода:', err);
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
        console.log(`Server listening on ${host}:${port}`);
        console.log(`1. Open on PC: http://localhost:${port}/host.html`);
        console.log(`2. Open on PHONE: http://${ip}:${port}`);
        console.log(`==================================================\n`);
    });
    return server;
}

module.exports = { getLocalIp, createServer, startServer };

// Only start server when run directly
if (require.main === module) {
    startServer();
}