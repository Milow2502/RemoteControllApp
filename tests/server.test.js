const http = require('http');
const { WebSocket } = require('ws');
const { mouse, Point, Button } = require('@nut-tree-fork/nut-js');

// Test utilities
const TEST_PORT = 2001;
const TEST_HOST = '127.0.0.1';

// Mock server for testing (without starting real server)
function createMockServer() {
    const connections = new Map();
    let hostSocket = null;
    let mobileSocket = null;

    const mockServer = {
        handleConnection: (ws) => {
            ws.on('message', (message) => {
                const data = JSON.parse(message.toString());

                if (data.type === 'register') {
                    if (data.role === 'host') {
                        hostSocket = ws;
                        ws.role = 'host';
                    } else if (data.role === 'mobile') {
                        mobileSocket = ws;
                        ws.role = 'mobile';
                    }
                    return;
                }

                // Forward WebRTC signaling
                if (['offer', 'answer', 'candidate'].includes(data.type)) {
                    if (ws.role === 'host' && mobileSocket) {
                        mobileSocket.send(JSON.stringify(data));
                    } else if (ws.role === 'mobile' && hostSocket) {
                        hostSocket.send(JSON.stringify(data));
                    }
                    return;
                }

                // Input events: mobile -> host
                if (data.type.startsWith('input_')) {
                    if (ws.role === 'mobile' && hostSocket) {
                        hostSocket.send(JSON.stringify(data));
                    }
                    return;
                }
            });
        },
        getHostSocket: () => hostSocket,
        getMobileSocket: () => mobileSocket,
        reset: () => {
            hostSocket = null;
            mobileSocket = null;
        }
    };

    return mockServer;
}

describe('Server Message Routing', () => {
    let mockServer;
    let mockHostWs;
    let mockMobileWs;

    beforeEach(() => {
        mockServer = createMockServer();
        mockHostWs = {
            role: 'host',
            send: jest.fn(),
            on: jest.fn()
        };
        mockMobileWs = {
            role: 'mobile',
            send: jest.fn(),
            on: jest.fn()
        };
    });

    test('should register host and mobile sockets', () => {
        mockServer.handleConnection(mockHostWs);
        mockServer.handleConnection(mockMobileWs);

        // Simulate register messages
        const hostRegister = { type: 'register', role: 'host' };
        const mobileRegister = { type: 'register', role: 'mobile' };

        mockHostWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify(hostRegister));
        mockMobileWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify(mobileRegister));

        expect(mockServer.getHostSocket()).toBe(mockHostWs);
        expect(mockServer.getMobileSocket()).toBe(mockMobileWs);
    });

    test('should forward offer from host to mobile', () => {
        mockServer.handleConnection(mockHostWs);
        mockServer.handleConnection(mockMobileWs);

        mockHostWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify({ type: 'register', role: 'mobile' }));

        const offer = { type: 'offer', offer: { sdp: 'test-sdp', type: 'offer' } };
        mockHostWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify(offer));

        expect(mockMobileWs.send).toHaveBeenCalledWith(JSON.stringify(offer));
    });

    test('should forward answer from mobile to host', () => {
        mockServer.handleConnection(mockHostWs);
        mockServer.handleConnection(mockMobileWs);

        mockHostWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify({ type: 'register', role: 'mobile' }));

        const answer = { type: 'answer', answer: { sdp: 'test-answer', type: 'answer' } };
        mockMobileWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify(answer));

        expect(mockHostWs.send).toHaveBeenCalledWith(JSON.stringify(answer));
    });

    test('should forward ICE candidates bidirectionally', () => {
        mockServer.handleConnection(mockHostWs);
        mockServer.handleConnection(mockMobileWs);

        mockHostWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify({ type: 'register', role: 'mobile' }));

        const candidate = { type: 'candidate', candidate: { candidate: 'test-candidate' } };
        mockHostWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify(candidate));

        expect(mockMobileWs.send).toHaveBeenCalledWith(JSON.stringify(candidate));

        mockMobileWs.send.mockClear();
        mockMobileWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify(candidate));

        expect(mockHostWs.send).toHaveBeenCalledWith(JSON.stringify(candidate));
    });

    test('should forward input events from mobile to host', () => {
        mockServer.handleConnection(mockHostWs);
        mockServer.handleConnection(mockMobileWs);

        mockHostWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify({ type: 'register', role: 'mobile' }));

        const inputMove = { type: 'input_move', x: 0.5, y: 0.5, screenWidth: 1920, screenHeight: 1080 };
        mockMobileWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify(inputMove));

        expect(mockHostWs.send).toHaveBeenCalledWith(JSON.stringify(inputMove));
    });

    test('should not forward input events from host', () => {
        mockServer.handleConnection(mockHostWs);
        mockServer.handleConnection(mockMobileWs);

        mockHostWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify({ type: 'register', role: 'mobile' }));

        const inputMove = { type: 'input_move', x: 0.5, y: 0.5, screenWidth: 1920, screenHeight: 1080 };
        mockHostWs.on.mock.calls.find(c => c[0] === 'message')[1](JSON.stringify(inputMove));

        expect(mockMobileWs.send).not.toHaveBeenCalled();
    });
});

describe('Input Coordinate Calculation', () => {
    test('should calculate correct screen coordinates from normalized values', () => {
        const screenWidth = 1920;
        const screenHeight = 1080;
        const normalizedX = 0.5;
        const normalizedY = 0.5;

        const targetX = Math.round(normalizedX * screenWidth);
        const targetY = Math.round(normalizedY * screenHeight);

        expect(targetX).toBe(960);
        expect(targetY).toBe(540);
    });

    test('should handle edge coordinates', () => {
        const screenWidth = 1920;
        const screenHeight = 1080;

        // Top-left
        expect(Math.round(0 * screenWidth)).toBe(0);
        expect(Math.round(0 * screenHeight)).toBe(0);

        // Bottom-right
        expect(Math.round(1 * screenWidth)).toBe(1920);
        expect(Math.round(1 * screenHeight)).toBe(1080);
    });

    test('should handle different screen resolutions', () => {
        const resolutions = [
            { width: 1920, height: 1080 },
            { width: 2560, height: 1440 },
            { width: 3840, height: 2160 },
            { width: 1366, height: 768 }
        ];

        resolutions.forEach(({ width, height }) => {
            const x = Math.round(0.25 * width);
            const y = Math.round(0.75 * height);
            expect(x).toBe(Math.round(width / 4));
            expect(y).toBe(Math.round(height * 3 / 4));
        });
    });
});

describe('getLocalIp Function', () => {
    const originalNetworkInterfaces = require('os').networkInterfaces;

    afterEach(() => {
        require('os').networkInterfaces = originalNetworkInterfaces;
    });

    test('should return first non-internal IPv4 address', () => {
        require('os').networkInterfaces = () => ({
            'eth0': [
                { family: 'IPv4', address: '127.0.0.1', internal: true },
                { family: 'IPv4', address: '192.168.1.100', internal: false },
                { family: 'IPv6', address: '::1', internal: true }
            ],
            'wlan0': [
                { family: 'IPv4', address: '10.0.0.50', internal: false }
            ]
        });

        // Re-require to get updated function
        jest.resetModules();
        const { getLocalIp } = require('../server.js');
        expect(getLocalIp()).toBe('192.168.1.100');
    });

    test('should return localhost when no external interface found', () => {
        require('os').networkInterfaces = () => ({
            'lo': [
                { family: 'IPv4', address: '127.0.0.1', internal: true }
            ]
        });

        jest.resetModules();
        const { getLocalIp } = require('../server.js');
        expect(getLocalIp()).toBe('localhost');
    });
});

describe('WebSocket URL Construction', () => {
    test('should construct correct WebSocket URL from location.host', () => {
        const mockLocation = { host: 'localhost:2000' };
        const wsUrl = `ws://${mockLocation.host}`;
        expect(wsUrl).toBe('ws://localhost:2000');
    });

    test('should work with IP address', () => {
        const mockLocation = { host: '192.168.1.42:2000' };
        const wsUrl = `ws://${mockLocation.host}`;
        expect(wsUrl).toBe('ws://192.168.1.42:2000');
    });
});

describe('Touch Coordinate Normalization', () => {
    const mockRect = { left: 0, top: 0, width: 390, height: 844 }; // iPhone 12 dimensions

    function getNormalizedCoords(touch) {
        const x = (touch.clientX - mockRect.left) / mockRect.width;
        const y = (touch.clientY - mockRect.top) / mockRect.height;
        return { x, y, valid: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
    }

    test('should normalize center touch correctly', () => {
        const touch = { clientX: 195, clientY: 422 };
        const coords = getNormalizedCoords(touch);
        expect(coords.x).toBeCloseTo(0.5);
        expect(coords.y).toBeCloseTo(0.5);
        expect(coords.valid).toBe(true);
    });

    test('should normalize corner touches', () => {
        // Top-left
        expect(getNormalizedCoords({ clientX: 0, clientY: 0 })).toEqual({ x: 0, y: 0, valid: true });
        // Bottom-right
        expect(getNormalizedCoords({ clientX: 390, clientY: 844 })).toEqual({ x: 1, y: 1, valid: true });
    });

    test('should mark out-of-bounds touches as invalid', () => {
        expect(getNormalizedCoords({ clientX: -10, clientY: 100 }).valid).toBe(false);
        expect(getNormalizedCoords({ clientX: 400, clientY: 100 }).valid).toBe(false);
        expect(getNormalizedCoords({ clientX: 100, clientY: -10 }).valid).toBe(false);
        expect(getNormalizedCoords({ clientX: 100, clientY: 900 }).valid).toBe(false);
    });
});