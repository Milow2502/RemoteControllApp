const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { mouse, Point, Button } = require('@nut-tree-fork/nut-js');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

mouse.config.mouseSpeed = 1000;

let hostSocket = null;
let mobileSocket = null;

wss.on('connection', (ws, req) => {
    ws.on('message', async (message) => {
        const data = JSON.parse(message);

        // 1. Регистрация узлов (Кто подключается — ПК или Телефон)
        if (data.type === 'register') {
            if (data.role === 'host') {
                hostSocket = ws;
                console.log('✅ ПК (Хост) подключен!');
            } else if (data.role === 'mobile') {
                mobileSocket = ws;
                console.log('📱 Телефон подключен!');
            }
        }

        // 2. Сигнализация WebRTC (Соединяем Видеопоток ПК -> Телефон)
        if (['offer', 'answer', 'candidate'].includes(data.type)) {
            if (ws === hostSocket && mobileSocket) mobileSocket.send(JSON.stringify(data));
            if (ws === mobileSocket && hostSocket) hostSocket.send(JSON.stringify(data));
        }

        // 3. Обработка тач-событий с телефона и эмуляция на ПК
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
                    if (data.button === 'right') {
                        await mouse.click(Button.RIGHT);
                    } else {
                        await mouse.click(Button.LEFT);
                    }
                } else if (data.type === 'input_scroll') {
                    // Прокрутка двумя пальцами
                    if (data.deltaY > 0) await mouse.scrollDown(100);
                    else await mouse.scrollUp(100);
                }
            } catch (err) {
                console.error('Ошибка исполнения ввода:', err);
            }
        }
    });
});

// Получение локального IP-адреса ПК
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const PORT = 2000;
server.listen(PORT, () => {
    const ip = getLocalIp();
    console.log(`\n==================================================`);
    console.log(`1. Откройте на ПК в браузере: http://localhost:${PORT}/host.html`);
    console.log(`2. Откройте на ТЕЛЕФОНЕ: http://${ip}:${PORT}`);
    console.log(`==================================================\n`);
});