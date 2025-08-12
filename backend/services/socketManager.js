const jwt = require('jsonwebtoken');

function initializeSocketIo(io, activeCameras) {
  // Middleware for authenticating socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Authentication error'));
      socket.user = decoded;
      next();
    });
  });

  // Handle new dashboard client connections
  io.on('connection', (socket) => {
    console.log(`Dashboard client connected: ${socket.id} for user ${socket.user.username}`);
    socket.join(String(socket.user.id));

    // Send the status of all currently active cameras for this user
    const userId = socket.user.id;
    for (const cameraId in activeCameras) {
      if (activeCameras[cameraId].userId === userId) {
        const cam = activeCameras[cameraId];
        socket.emit('cameraStatusUpdate', { cameraId, status: cam.status, name: cam.name });
      }
    }

    // Handle request for pending cameras
    socket.on('getPendingCameras', () => {
      const pendingCameras = Object.entries(activeCameras)
        .filter(([_, camera]) => camera.status === 'pending' && camera.userId === null)
        .map(([cameraId, camera]) => ({ cameraId, name: camera.name }));
      socket.emit('pendingCamerasResponse', { cameras: pendingCameras });
    });

    // Handle camera control commands
    socket.on('camera-control', (data) => {
      const { cameraId, command, settings } = data;
      const userId = socket.user.id;

      console.log(`📹 Camera control request from user ${userId} for camera ${cameraId}:`, command, settings);
      console.log(`📹 Available cameras:`, Object.keys(activeCameras));
      console.log(`📹 Camera details:`, activeCameras[cameraId]);

      // Verify user owns this camera
      const camera = activeCameras[cameraId];
      if (!camera) {
        console.log(`❌ Camera ${cameraId} not found in activeCameras`);
        console.log(`❌ Available cameras: ${Object.keys(activeCameras).join(', ')}`);
        socket.emit('camera-control-error', { cameraId, error: 'Camera not found. Please refresh the page and try again.' });
        return;
      }

      // Convert both to strings for comparison to avoid type mismatch
      if (String(camera.userId) !== String(userId)) {
        console.log(`❌ User ${userId} attempted to control unauthorized camera ${cameraId} (owner: ${camera.userId})`);
        console.log(`❌ User ID types: user=${typeof userId} (${userId}), camera owner=${typeof camera.userId} (${camera.userId})`);
        socket.emit('camera-control-error', { cameraId, error: 'Unauthorized access to camera' });
        return;
      }

      // Check if camera WebSocket is available
      if (!camera.ws || camera.ws.readyState !== 1) {
        console.log(`❌ Camera ${cameraId} WebSocket not available for control (readyState: ${camera.ws?.readyState})`);
        socket.emit('camera-control-error', { cameraId, error: 'Camera not connected. Please wait for camera to reconnect.' });
        return;
      }

      // Forward control command to camera
      try {
        let message;
        if (command === 'settings') {
          // Camera settings command
          message = JSON.stringify({ type: 'camera_settings', resolution: settings.resolution, quality: settings.quality });
        } else {
          // Generic command
          message = JSON.stringify({ type: command, ...settings });
        }

        console.log(`📤 Sending control message to camera ${cameraId}:`, message);
        camera.ws.send(message);

        // Acknowledge to dashboard
        socket.emit('camera-control-sent', { cameraId, command, settings, timestamp: Date.now() });
      } catch (error) {
        console.error(`❌ Error sending control message to camera ${cameraId}:`, error);
        socket.emit('camera-control-error', { cameraId, error: 'Failed to send command to camera' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Dashboard client disconnected: ${socket.id}`);
    });
  });
}

module.exports = initializeSocketIo;

