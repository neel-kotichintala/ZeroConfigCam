const url = require('url');
const { query } = require('../database/connection');

function initializeCameraSockets(server, wss, io, activeCameras) {
  // Heartbeat mechanism to detect dead connections
  const heartbeatInterval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping(() => {});
    });
  }, 30000);

  wss.on('close', function close() {
    clearInterval(heartbeatInterval);
  });

  // Handle WebSocket upgrade requests from cameras
  server.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url).pathname;

    // Ignore socket.io's own upgrade requests
    if (pathname.startsWith('/socket.io/')) {
      return;
    }

    const cameraId = pathname.substring(1);

    if (!cameraId) {
      console.log('Upgrade request with no camera ID. Destroying socket.');
      return socket.destroy();
    }

    // Allow any camera to connect - they'll be in "pending" state until claimed by a user
    console.log(`Camera attempting to connect with ID: ${cameraId}`);

    // Handle WebSocket upgrade with ESP32 compatibility
    try {
      wss.handleUpgrade(request, socket, head, (ws) => {
        // Set ESP32-friendly options
        ws.binaryType = 'arraybuffer';
        wss.emit('connection', ws, request, { cameraId });
      });
    } catch (error) {
      console.error('WebSocket upgrade failed:', error.message);
      socket.destroy();
    }
  });

  // Handle new camera connections
  wss.on('connection', (ws, req, data) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Add comprehensive error handling for ESP32 compatibility
    ws.on('error', (error) => {
      console.error('WebSocket error for camera', cameraId, ':', error.message);

      // Handle specific ESP32 WebSocket compatibility issues
      if (
        error.code === 'WS_ERR_UNEXPECTED_RSV_2_3' ||
        error.code === 'WS_ERR_UNEXPECTED_RSV_1' ||
        error.message.includes('RSV')
      ) {
        console.log('🔧 ESP32 WebSocket compatibility issue detected - continuing anyway...');
        // Don't close the connection for RSV errors - ESP32 quirk
        return;
      }

      // For other errors, close the connection
      console.log('❌ Closing WebSocket due to error:', error.code);
      ws.terminate();
    });

    const { cameraId } = data;

    // Check if this camera already exists and is owned by someone
    (async () => {
      try {
        const { rows: existingRows } = await query('SELECT * FROM cameras WHERE camera_id = $1', [cameraId]);
        const existingCamera = existingRows[0];
        if (existingCamera) {
        // Camera already exists - reconnect to existing owner
        const userId = existingCamera.user_id;
        const cameraName = existingCamera.name;

        activeCameras[cameraId] = { name: cameraName, userId: userId, status: 'online' };
        console.log(`Camera '${cameraName}' reconnected for user ${userId}`);

        // Update status to online
        await query('UPDATE cameras SET status = $1 WHERE camera_id = $2', ['online', cameraId]);

        // Notify the owner's dashboard
        io.to(String(userId)).emit('cameraStatusUpdate', { cameraId, status: 'online', name: cameraName });

        // Store WebSocket reference for camera control
        activeCameras[cameraId].ws = ws;

        // Handle streaming and control messages
        ws.on('message', (message) => {
          // Check if this is a text message (camera control response) or binary (video frame)
          if (typeof message === 'string' || (message instanceof Buffer && message[0] < 0x80)) {
            // Text message - likely a control response or status update
            console.log(`📝 Control message from camera ${cameraId}:`, message.toString());

            // Forward control responses to the dashboard
            io.to(String(userId)).emit('camera-control-response', {
              cameraId,
              message: message.toString(),
              timestamp: Date.now(),
            });
          } else {
            // Binary message - video frame
            const frameSize = message.byteLength || message.length || 0;
            console.log(`📡 Received frame from camera ${cameraId}: ${frameSize} bytes, type: ${message.constructor.name}`);
            io.to(String(userId)).emit('stream', {
              cameraId,
              frame: message,
              frameType: 'binary',
              frameSize: frameSize,
              timestamp: Date.now(),
            });
          }
        });

        ws.on('close', async () => {
          console.log(`Camera '${cameraName}' disconnected.`);
          // Clean up WebSocket reference
          if (activeCameras[cameraId]) {
            delete activeCameras[cameraId].ws;
            delete activeCameras[cameraId];
          }
          await query('UPDATE cameras SET status = $1 WHERE camera_id = $2', ['offline', cameraId]);
          io.to(String(userId)).emit('cameraStatusUpdate', { cameraId, status: 'offline', name: cameraName });
        });
      } else {
        // New camera - WebSocket connected (already registered via HTTP)
        console.log(`🎥 WEBSOCKET CONNECTED: '${cameraId}' - already registered via HTTP`);

        // Camera should already be in activeCameras from HTTP registration
        // Just update the status if needed
        if (activeCameras[cameraId]) {
          activeCameras[cameraId].status = 'pending';
        } else {
          // Fallback if HTTP registration didn't work
          activeCameras[cameraId] = {
            name: `Camera ${cameraId.substring(0, 8)}`,
            userId: null,
            status: 'pending',
          };
        }

        // Don't broadcast again - HTTP registration already did this

        ws.on('close', () => {
          console.log(`Unclaimed camera '${cameraId}' disconnected.`);
          delete activeCameras[cameraId];
        });
      }
      } catch (err) {
        console.error('Error checking existing camera:', err);
        return ws.close();
      }
    })();
  });
}

module.exports = initializeCameraSockets;

