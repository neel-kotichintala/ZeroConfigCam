// Main Server Application
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const WebSocket = require('ws');
require('dotenv').config();

// Import configuration
const config = require('../config/app-config.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const wss = new WebSocket.Server({ 
    noServer: true,
    perMessageDeflate: false
});

const activeCameras = {}; // { cameraId: { name, userId, status }, ... }

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files from organized client directory
app.use('/styles', express.static(path.join(__dirname, '..', 'client', 'styles')));
app.use('/scripts', express.static(path.join(__dirname, '..', 'client', 'scripts')));
app.use('/assets', express.static(path.join(__dirname, '..', 'client', 'assets')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

const db = require('./database/connection.js');
const createMainApiRouter = require('./api/routes.js');
const initializeSocketIo = require('./websockets/socket-manager.js');
const initializeCameraSockets = require('./websockets/camera-events.js');

setInterval(() => {
        db.run("DELETE FROM setup_sessions WHERE created_at < DATETIME('now', '-1 hour') AND session_id NOT IN (SELECT camera_id FROM cameras)", function(err) {
        if (err) {
            console.error('Error cleaning up old sessions:', err.message);
        } else if (this.changes > 0) {
            console.log(`Cleaned up ${this.changes} expired setup sessions.`);
        }
    });
}, 3600000);



app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'login.html')));
app.get('/setup', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'camera-setup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'pages', 'dashboard.html')));



// API Routes
const mainApiRouter = createMainApiRouter(io, activeCameras);
app.use('/api', mainApiRouter);













// Initialize Socket Handlers
initializeSocketIo(io, activeCameras);
initializeCameraSockets(server, wss, io, activeCameras);

process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    db.close((err) => {
        if (err) console.error('Error closing database:', err.message);
        else console.log('Database connection closed.');
        process.exit(0);
    });
});

server.listen(config.server.port, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${config.server.port}`);
    console.log(`📱 Environment: ${config.server.environment}`);
    console.log(`🌐 Accessible on the local network`);
});
