const { WebSocket } = require('ws');

// Mock server for unit testing message routing and state management
function createMockServer() {
    let hostSocket = null;
    let mobileSocket = null;
    let isHostStreaming = false;

    const mockServer = {
        handleConnection: (ws) => {
            if (!ws._handlers) ws._handlers = {};
            ws.on = (event, callback) => {
                ws._handlers[event] = callback;
            };

            ws.trigger = (event, data) => {
                if (ws._handlers && ws._handlers[event]) {
                    ws._handlers[event](data);
                }
            };
        },
        registerMessageListener: (ws) => {
            if (!ws._handlers) ws._handlers = {};
            ws._handlers['message'] = (message) => {
                const data = JSON.parse(message.toString());

                if (data.type === 'register') {
                    if (data.role === 'host') {
                        hostSocket = ws;
                        ws.role = 'host';
                        if (mobileSocket) {
                            mobileSocket.send(JSON.stringify({
                                type: 'host_status',
                                online: true,
                                streaming: isHostStreaming
                            }));
                        }
                    } else if (data.role === 'mobile') {
                        mobileSocket = ws;
                        ws.role = 'mobile';
                        const hostOnline = !!hostSocket;
                        ws.send(JSON.stringify({
                            type: 'host_status',
                            online: hostOnline,
                            streaming: isHostStreaming
                        }));
                        if (hostOnline) {
                            hostSocket.send(JSON.stringify({
                                type: 'mobile_status',
                                online: true
                            }));
                        }
                    }
                    return;
                }

                if (data.type === 'host_stream_status') {
                    if (ws.role === 'host') {
                        isHostStreaming = !!data.active;
                        if (mobileSocket) {
                            mobileSocket.send(JSON.stringify({
                                type: 'host_stream_status',
                                active: isHostStreaming
                            }));
                        }
                    }
                    return;
                }

                if (data.type === 'request_stream') {
                    if (hostSocket) {
                        hostSocket.send(JSON.stringify({ type: 'request_stream' }));
                    }
                    return;
                }

                // WebRTC signaling
                if (['offer', 'answer', 'candidate'].includes(data.type)) {
                    if (ws.role === 'host' && mobileSocket) {
                        mobileSocket.send(JSON.stringify(data));
                    } else if (ws.role === 'mobile' && hostSocket) {
                        hostSocket.send(JSON.stringify(data));
                    }
                    return;
                }

                // Input events
                if (data.type.startsWith('input_')) {
                    if (ws.role === 'mobile' && hostSocket) {
                        hostSocket.send(JSON.stringify(data));
                    }
                    return;
                }
            };

            ws._handlers['close'] = () => {
                if (ws === hostSocket) {
                    hostSocket = null;
                    isHostStreaming = false;
                    if (mobileSocket) {
                        mobileSocket.send(JSON.stringify({
                            type: 'host_status',
                            online: false,
                            streaming: false
                        }));
                    }
                } else if (ws === mobileSocket) {
                    mobileSocket = null;
                    if (hostSocket) {
                        hostSocket.send(JSON.stringify({
                            type: 'mobile_status',
                            online: false
                        }));
                    }
                }
            };
        },
        getHostSocket: () => hostSocket,
        getMobileSocket: () => mobileSocket,
        isStreaming: () => isHostStreaming,
        reset: () => {
            hostSocket = null;
            mobileSocket = null;
            isHostStreaming = false;
        }
    };

    return mockServer;
}

describe('Server Message Routing & State', () => {
    let mockServer;
    let mockHostWs;
    let mockMobileWs;

    beforeEach(() => {
        mockServer = createMockServer();
        mockHostWs = {
            send: jest.fn(),
            _handlers: {}
        };
        mockMobileWs = {
            send: jest.fn(),
            _handlers: {}
        };

        mockServer.handleConnection(mockHostWs);
        mockServer.handleConnection(mockMobileWs);
        mockServer.registerMessageListener(mockHostWs);
        mockServer.registerMessageListener(mockMobileWs);
    });

    test('should register host and mobile sockets and notify status', () => {
        mockHostWs.trigger('message', JSON.stringify({ type: 'register', role: 'host' }));
        expect(mockServer.getHostSocket()).toBe(mockHostWs);

        mockMobileWs.trigger('message', JSON.stringify({ type: 'register', role: 'mobile' }));
        expect(mockServer.getMobileSocket()).toBe(mockMobileWs);

        expect(mockMobileWs.send).toHaveBeenCalledWith(JSON.stringify({
            type: 'host_status',
            online: true,
            streaming: false
        }));

        expect(mockHostWs.send).toHaveBeenCalledWith(JSON.stringify({
            type: 'mobile_status',
            online: true
        }));
    });

    test('should notify mobile when host starts/stops stream', () => {
        mockHostWs.trigger('message', JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.trigger('message', JSON.stringify({ type: 'register', role: 'mobile' }));

        mockMobileWs.send.mockClear();

        mockHostWs.trigger('message', JSON.stringify({ type: 'host_stream_status', active: true }));
        expect(mockMobileWs.send).toHaveBeenCalledWith(JSON.stringify({
            type: 'host_stream_status',
            active: true
        }));

        mockHostWs.trigger('message', JSON.stringify({ type: 'host_stream_status', active: false }));
        expect(mockMobileWs.send).toHaveBeenCalledWith(JSON.stringify({
            type: 'host_stream_status',
            active: false
        }));
    });

    test('should forward stream request from mobile to host', () => {
        mockHostWs.trigger('message', JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.trigger('message', JSON.stringify({ type: 'register', role: 'mobile' }));

        mockHostWs.send.mockClear();

        mockMobileWs.trigger('message', JSON.stringify({ type: 'request_stream' }));
        expect(mockHostWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'request_stream' }));
    });

    test('should forward WebRTC offer from host to mobile', () => {
        mockHostWs.trigger('message', JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.trigger('message', JSON.stringify({ type: 'register', role: 'mobile' }));

        const offer = { type: 'offer', offer: { sdp: 'test-sdp', type: 'offer' }, screenWidth: 1920, screenHeight: 1080 };
        mockHostWs.trigger('message', JSON.stringify(offer));

        expect(mockMobileWs.send).toHaveBeenCalledWith(JSON.stringify(offer));
    });

    test('should forward WebRTC answer from mobile to host', () => {
        mockHostWs.trigger('message', JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.trigger('message', JSON.stringify({ type: 'register', role: 'mobile' }));

        const answer = { type: 'answer', answer: { sdp: 'test-answer', type: 'answer' } };
        mockMobileWs.trigger('message', JSON.stringify(answer));

        expect(mockHostWs.send).toHaveBeenCalledWith(JSON.stringify(answer));
    });

    test('should forward ICE candidates bidirectionally', () => {
        mockHostWs.trigger('message', JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.trigger('message', JSON.stringify({ type: 'register', role: 'mobile' }));

        const candidate = { type: 'candidate', candidate: { candidate: 'test-candidate' } };
        mockHostWs.trigger('message', JSON.stringify(candidate));
        expect(mockMobileWs.send).toHaveBeenCalledWith(JSON.stringify(candidate));

        mockHostWs.send.mockClear();
        mockMobileWs.trigger('message', JSON.stringify(candidate));
        expect(mockHostWs.send).toHaveBeenCalledWith(JSON.stringify(candidate));
    });

    test('should handle host socket disconnect and notify mobile', () => {
        mockHostWs.trigger('message', JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.trigger('message', JSON.stringify({ type: 'register', role: 'mobile' }));

        mockMobileWs.send.mockClear();
        mockHostWs.trigger('close');

        expect(mockServer.getHostSocket()).toBeNull();
        expect(mockMobileWs.send).toHaveBeenCalledWith(JSON.stringify({
            type: 'host_status',
            online: false,
            streaming: false
        }));
    });

    test('should handle mobile socket disconnect and notify host', () => {
        mockHostWs.trigger('message', JSON.stringify({ type: 'register', role: 'host' }));
        mockMobileWs.trigger('message', JSON.stringify({ type: 'register', role: 'mobile' }));

        mockHostWs.send.mockClear();
        mockMobileWs.trigger('close');

        expect(mockServer.getMobileSocket()).toBeNull();
        expect(mockHostWs.send).toHaveBeenCalledWith(JSON.stringify({
            type: 'mobile_status',
            online: false
        }));
    });
});

describe('Touch Coordinate Normalization with Letterbox/Pillarbox', () => {
    function calculateNormalizedCoords(touch, containerRect, videoWidth, videoHeight) {
        const containerRatio = containerRect.width / containerRect.height;
        const videoRatio = videoWidth / videoHeight;

        let renderWidth, renderHeight, offsetX, offsetY;

        if (containerRatio > videoRatio) {
            // Pillarbox: bars on left/right
            renderHeight = containerRect.height;
            renderWidth = containerRect.height * videoRatio;
            offsetX = (containerRect.width - renderWidth) / 2;
            offsetY = 0;
        } else {
            // Letterbox: bars on top/bottom
            renderWidth = containerRect.width;
            renderHeight = containerRect.width / videoRatio;
            offsetX = 0;
            offsetY = (containerRect.height - renderHeight) / 2;
        }

        const touchX = touch.clientX - containerRect.left - offsetX;
        const touchY = touch.clientY - containerRect.top - offsetY;

        const normX = Math.max(0, Math.min(1, touchX / renderWidth));
        const normY = Math.max(0, Math.min(1, touchY / renderHeight));
        const valid = touchX >= 0 && touchX <= renderWidth && touchY >= 0 && touchY <= renderHeight;

        return { x: normX, y: normY, valid };
    }

    test('should correctly map center touch on letterboxed screen (portrait phone, 16:9 stream)', () => {
        const containerRect = { left: 0, top: 0, width: 360, height: 800 };
        const videoWidth = 1920;
        const videoHeight = 1080;

        // Video height on phone: 360 / (16/9) = 202.5px. Center is y=400, x=180
        const touchCenter = { clientX: 180, clientY: 400 };
        const result = calculateNormalizedCoords(touchCenter, containerRect, videoWidth, videoHeight);

        expect(result.x).toBeCloseTo(0.5);
        expect(result.y).toBeCloseTo(0.5);
        expect(result.valid).toBe(true);
    });

    test('should invalidate touches outside the video frame (in letterbox bar)', () => {
        const containerRect = { left: 0, top: 0, width: 360, height: 800 };
        const videoWidth = 1920;
        const videoHeight = 1080;

        // Top bar touch (y=50, while video starts at y ≈ 298.75)
        const touchInTopBar = { clientX: 180, clientY: 50 };
        const result = calculateNormalizedCoords(touchInTopBar, containerRect, videoWidth, videoHeight);

        expect(result.valid).toBe(false);
    });

    test('should correctly map corners of the video frame in landscape mode (pillarbox)', () => {
        const containerRect = { left: 0, top: 0, width: 900, height: 360 };
        const videoWidth = 1920;
        const videoHeight = 1080;

        // Video width on landscape: 360 * (16/9) = 640px. offsetX = (900 - 640)/2 = 130px.
        const topLeftVideo = { clientX: 130, clientY: 0 };
        const resultTopLeft = calculateNormalizedCoords(topLeftVideo, containerRect, videoWidth, videoHeight);

        expect(resultTopLeft.x).toBeCloseTo(0);
        expect(resultTopLeft.y).toBeCloseTo(0);
        expect(resultTopLeft.valid).toBe(true);

        const bottomRightVideo = { clientX: 770, clientY: 360 };
        const resultBottomRight = calculateNormalizedCoords(bottomRightVideo, containerRect, videoWidth, videoHeight);

        expect(resultBottomRight.x).toBeCloseTo(1);
        expect(resultBottomRight.y).toBeCloseTo(1);
        expect(resultBottomRight.valid).toBe(true);
    });
});

describe('getLocalIp Function', () => {
    const originalNetworkInterfaces = require('os').networkInterfaces;

    afterEach(() => {
        require('os').networkInterfaces = originalNetworkInterfaces;
    });

    test('should return preferred private IPv4 address', () => {
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