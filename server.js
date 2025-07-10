const url = require('url');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
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
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            email TEXT UNIQUE,
            password TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS setup_sessions (
            session_id TEXT PRIMARY KEY,
            user_id INTEGER,
            camera_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            used INTEGER DEFAULT 0
        )`);
    }
});

setInterval(() => {
    db.run("DELETE FROM setup_sessions WHERE created_at < DATETIME('now', '-1 hour') AND used = 0", function(err) {
        if (err) {
            console.error('Error cleaning up old sessions:', err.message);
        } else if (this.changes > 0) {
            console.log(`Cleaned up ${this.changes} expired setup sessions.`);
        }
    });
}, 3600000);

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/setup', (req, res) => res.sendFile(path.join(__dirname, 'public', 'setup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    try {
        const hashedPassword = await bcryptjs.hash(password, 10);
        db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword], function(err) {
            if (err) {
                return res.status(409).json({ error: 'Username or email already exists.' });
            }
            const userId = this.lastID;
            const token = jwt.sign({ id: userId, username: username }, process.env.JWT_SECRET, { expiresIn: '24h' });
            res.status(201).json({ message: 'User registered successfully.', token, username });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body; // This can be username or email
    db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username], async (err, user) => {
        if (err || !user || !(await bcryptjs.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, username: user.username });
    });
});

app.post('/api/setup', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { wifi_ssid, wifi_password, camera_name } = req.body;
        const sessionId = Math.random().toString(36).substring(2, 10); // Shorter, 8-char random ID
        const qrData = `S:${wifi_ssid};P:${wifi_password};I:${sessionId}`;
        const qrCodeDataUrl = await QRCode.toDataURL(qrData);

        await new Promise((resolve, reject) => {
            db.run('INSERT INTO setup_sessions (session_id, user_id, camera_name) VALUES (?, ?, ?)', [sessionId, userId, camera_name], (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });

        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
        res.json({ qrCode: qrCodeDataUrl, sessionId, expiresAt });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({ error: 'Failed to generate QR code.' });
    }
});

app.get('/api/user', authenticateToken, (req, res) => {
    res.json({ username: req.user.username });
});

app.delete('/api/camera/:id', authenticateToken, (req, res) => {
    const cameraId = req.params.id;
    const userId = req.user.id;

    db.get('SELECT user_id FROM setup_sessions WHERE session_id = ?', [cameraId], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (!row) return res.status(404).json({ error: 'Camera not found.' });
        if (row.user_id !== userId) return res.status(403).json({ error: 'Forbidden.' });

        db.run('DELETE FROM setup_sessions WHERE session_id = ?', [cameraId], function(dbErr) {
            if (dbErr) return res.status(500).json({ error: 'Failed to delete camera.' });
            
            if (activeCameras[cameraId]) {
                delete activeCameras[cameraId];
            }

            io.to(String(userId)).emit('cameraStatusUpdate', { cameraId, status: 'deleted' });
            res.status(200).json({ message: 'Camera deleted successfully.' });
        });
    });
});

server.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url).pathname;

    // Ignore socket.io's own upgrade requests
    if (pathname.startsWith('/socket.io/')) {
        return;
    }
    const sessionId = pathname.substring(1);

    if (!sessionId) {
        console.log('Upgrade request with no session ID. Destroying socket.');
        return socket.destroy();
    }

    db.get('SELECT * FROM setup_sessions WHERE session_id = ?', [sessionId], (err, row) => {
        if (err) {
            console.error('DB error during upgrade check:', err);
            return socket.destroy();
        }

        if (row) {
            console.log(`Valid session ID found for camera: ${sessionId}. Upgrading connection.`);
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        } else {
            console.log(`No valid setup session found for ID: ${sessionId}. Destroying socket.`);
            socket.destroy();
        }
    });
});

wss.on('connection', (ws, req) => {
    const sessionId = req.url.substring(1);
    if (!sessionId) {
        ws.terminate();
        return;
    }

    db.get('SELECT user_id, camera_name FROM setup_sessions WHERE session_id = ?', [sessionId], (err, session) => {
        if (err || !session) {
            ws.terminate();
            return;
        }

        const { user_id, camera_name } = session;
        const cameraId = sessionId;

        activeCameras[cameraId] = { name: camera_name, userId: user_id, status: 'online' };
        console.log(`Camera '${camera_name}' connected for user ${user_id}.`);

        io.to(String(user_id)).emit('cameraStatusUpdate', { cameraId, status: 'online', name: camera_name });

        ws.on('message', (message) => {
            io.to(String(user_id)).emit('stream', { cameraId, frame: message });
        });

        ws.on('close', () => {
            console.log(`Camera '${camera_name}' disconnected.`);
            delete activeCameras[cameraId];
            io.to(String(user_id)).emit('cameraStatusUpdate', { cameraId, status: 'offline', name: camera_name });
        });
    });
});

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error'));
        socket.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    console.log(`Dashboard client connected: ${socket.id} for user ${socket.user.username}`);
    socket.join(String(socket.user.id));

    const userId = socket.user.id;
    for (const cameraId in activeCameras) {
        if (activeCameras[cameraId].userId === userId) {
            const cam = activeCameras[cameraId];
            socket.emit('cameraStatusUpdate', { cameraId, status: cam.status, name: cam.name });
        }
    }

    socket.on('disconnect', () => {
        console.log(`Dashboard client disconnected: ${socket.id}`);
    });
});

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
