const url = require('url');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');

const QRCode = require('qrcode');

const WebSocket = require('ws');
const os = require('os');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '0.0.0.0'; // Fallback
}

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
app.use(express.static(path.join(__dirname, '..', 'public')));

const db = require('./db/database.js');
const createMainApiRouter = require('./routes');
const initializeSocketIo = require('./sockets/socketHandler.js');
const initializeCameraSockets = require('./sockets/cameraHandler.js');

setInterval(() => {
        db.run("DELETE FROM setup_sessions WHERE created_at < DATETIME('now', '-1 hour') AND session_id NOT IN (SELECT camera_id FROM cameras)", function(err) {
        if (err) {
            console.error('Error cleaning up old sessions:', err.message);
        } else if (this.changes > 0) {
            console.log(`Cleaned up ${this.changes} expired setup sessions.`);
        }
    });
}, 3600000);



app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/setup', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'setup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html')));



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

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} and accessible on the local network.`);
});
