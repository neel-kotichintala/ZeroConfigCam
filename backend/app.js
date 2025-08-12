// Main Server Application (refactored structure)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const WebSocket = require('ws');
require('dotenv').config();

// Import configuration
const config = require('./config/app-config.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const wss = new WebSocket.Server({
  noServer: true,
  perMessageDeflate: false,
  // ESP32 compatibility settings
  maxPayload: 1024 * 1024, // 1MB max payload
  skipUTF8Validation: true, // Skip UTF8 validation for binary data
  clientTracking: true,
  // More permissive settings for ESP32
  verifyClient: () => true, // Accept all clients
  handleProtocols: () => false, // Don't handle sub-protocols
});

const activeCameras = {}; // { cameraId: { name, userId, status }, ... }

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from organized directories
const frontendRoot = path.join(__dirname, '..', 'frontend');
// Scripts and styles/assets served from new frontend structure
app.use('/scripts', express.static(path.join(frontendRoot, 'scripts')));
app.use('/styles', express.static(path.join(frontendRoot, 'styles')));
// Prefer new assets location, fall back to old until fully migrated
app.use('/assets', express.static(path.join(frontendRoot, 'assets')));
app.use('/assets', express.static(path.join(__dirname, '..', 'src', 'client', 'assets')));
// Shared utilities
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

const { query, end } = require('./database/connection.js');
const { initDb } = require('./database/init.js');
const createMainApiRouter = require('./routes');
const initializeSocketIo = require('./services/socketManager.js');
const initializeCameraSockets = require('./services/cameraEvents.js');

// Pages
app.get('/', (req, res) =>
  res.sendFile(path.join(frontendRoot, 'pages', 'login.html'))
);
app.get('/setup', (req, res) =>
  res.sendFile(path.join(frontendRoot, 'pages', 'camera-setup.html'))
);
app.get('/dashboard', (req, res) =>
  res.sendFile(path.join(frontendRoot, 'pages', 'dashboard.html'))
);

// Camera registration endpoint (no auth required - for ESP32 cameras)
app.post('/api/camera/register', async (req, res) => {
  const { cameraId } = req.body;

  if (!cameraId) {
    return res.status(400).json({ error: 'Camera ID is required.' });
  }

  console.log(`📷 HTTP: Camera registration request from ${cameraId}`);

  try {
    const { rows } = await query('SELECT * FROM cameras WHERE camera_id = $1', [cameraId]);
    const existingCamera = rows[0];
    if (existingCamera) {
      // Camera already exists - just update status
      activeCameras[cameraId] = {
        name: existingCamera.name,
        userId: existingCamera.user_id,
        status: 'online',
      };
      console.log(`📷 HTTP: Existing camera '${existingCamera.name}' reconnected`);

      // Notify the owner's dashboard
      io.to(String(existingCamera.user_id)).emit('cameraStatusUpdate', {
        cameraId,
        status: 'online',
        name: existingCamera.name,
      });

      res.json({ status: 'reconnected', message: 'Camera reconnected successfully' });
    } else {
      // New camera - put it in pending state temporarily
      activeCameras[cameraId] = {
        name: `Camera ${cameraId.substring(0, 8)}`,
        userId: null,
        status: 'pending',
      };
      console.log(`📷 HTTP: New camera '${cameraId}' registered and waiting for auto-claim`);

      // Auto-claim logic: find the user who most recently generated a QR code
      const recent = await query(
        'SELECT user_id, users.username FROM qr_codes JOIN users ON qr_codes.user_id = users.id ORDER BY qr_codes.created_at DESC LIMIT 1'
      );
      const recentUser = recent.rows[0];
      if (!recentUser) {
        console.log(`📡 No recent user found, broadcasting to all users`);
        io.emit('newCameraAvailable', { cameraId, name: `Camera ${cameraId.substring(0, 8)}` });
        res.json({ status: 'pending', message: 'Camera registered successfully, waiting to be claimed' });
      } else {
        const userId = recentUser.user_id;
        const cameraName = `Camera ${cameraId.substring(0, 8)}`;
        try {
          await query('INSERT INTO cameras (camera_id, user_id, name, status) VALUES ($1, $2, $3, $4)', [cameraId, userId, cameraName, 'online']);
          activeCameras[cameraId] = { name: cameraName, userId: userId, status: 'online' };
          console.log(`✅ Camera '${cameraName}' auto-claimed by user ${recentUser.username}`);
          io.to(String(userId)).emit('cameraStatusUpdate', { cameraId, status: 'online', name: cameraName });
          io.to(String(userId)).emit('cameraAutoAdded', { cameraId, name: cameraName, message: `${cameraName} has been automatically added to your dashboard!` });
          res.json({ status: 'auto-claimed', message: 'Camera automatically added to dashboard' });
        } catch (dbErr) {
          console.error('Error auto-claiming camera:', dbErr);
          io.emit('newCameraAvailable', { cameraId, name: cameraName });
          res.json({ status: 'pending', message: 'Camera registered, manual claim required' });
        }
      }
    }
  } catch (err) {
    console.error('Error checking existing camera:', err);
    return res.status(500).json({ error: 'Database error.' });
  }
});

// API Routes
const mainApiRouter = createMainApiRouter(io, activeCameras);
app.use('/api', mainApiRouter);

// Initialize Socket Handlers
initializeSocketIo(io, activeCameras);
initializeCameraSockets(server, wss, io, activeCameras);

process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  end()
    .then(() => {
      console.log('Database connection closed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error closing database:', err.message);
      process.exit(1);
    });
});

(async () => {
  try {
    await initDb();
    server.listen(config.server.port, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${config.server.port}`);
      console.log(`📱 Environment: ${config.server.environment}`);
      console.log(`🌐 Accessible on the local network`);
    });
  } catch (e) {
    console.error('Failed to initialize database:', e);
    process.exit(1);
  }
})();

