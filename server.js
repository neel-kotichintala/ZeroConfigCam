const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const QRCode = require('qrcode');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow inline scripts for streaming
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Database setup
const db = new sqlite3.Database(process.env.DB_PATH || './database.sqlite');

// Initialize database
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cameras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        camera_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        rtsp_url TEXT,
        status TEXT DEFAULT 'offline',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS setup_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_id TEXT UNIQUE NOT NULL,
        wifi_ssid TEXT NOT NULL,
        wifi_password TEXT NOT NULL,
        camera_name TEXT NOT NULL,
        qr_data TEXT NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
});

// Active streams storage
const activeStreams = new Map();
const streamClients = new Map();

// JWT middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Routes

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve setup page
app.get('/setup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'setup.html'));
});

// Serve dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// User registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Username or email already exists' });
                    }
                    return res.status(500).json({ error: 'Registration failed' });
                }

                const token = jwt.sign(
                    { userId: this.lastID, username },
                    process.env.JWT_SECRET,
                    { expiresIn: '24h' }
                );

                res.json({ token, username });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// User login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    db.get(
        'SELECT * FROM users WHERE username = ? OR email = ?',
        [username, username],
        async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Login failed' });
            }

            if (!user || !await bcrypt.compare(password, user.password)) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign(
                { userId: user.id, username: user.username },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );

            res.json({ token, username: user.username });
        }
    );
});

// Create setup session and generate QR code
app.post('/api/setup/create', authenticateToken, async (req, res) => {
    try {
        const { wifi_ssid, wifi_password, camera_name } = req.body;

        if (!wifi_ssid || !wifi_password || !camera_name) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const sessionId = uuidv4();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        // QR code data format for AMB82
        const qrData = JSON.stringify({
            sessionId,
            wifiSSID: wifi_ssid,
            wifiPassword: wifi_password,
            serverUrl: process.env.SERVER_URL,
            cameraName: camera_name
        });

        // Generate QR code
        const qrCodeDataUrl = await QRCode.toDataURL(qrData);

        db.run(
            'INSERT INTO setup_sessions (user_id, session_id, wifi_ssid, wifi_password, camera_name, qr_data, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.userId, sessionId, wifi_ssid, wifi_password, camera_name, qrData, expiresAt.toISOString()],
            function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Failed to create setup session' });
                }

                res.json({
                    sessionId,
                    qrCode: qrCodeDataUrl,
                    expiresAt: expiresAt.toISOString()
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Failed to create setup session' });
    }
});

// Camera registration endpoint (called by AMB82)
app.post('/api/camera/register', (req, res) => {
    const { sessionId, cameraId, rtspUrl } = req.body;

    if (!sessionId || !cameraId || !rtspUrl) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify setup session
    db.get(
        'SELECT * FROM setup_sessions WHERE session_id = ? AND used = FALSE AND expires_at > datetime("now")',
        [sessionId],
        (err, session) => {
            if (err || !session) {
                return res.status(400).json({ error: 'Invalid or expired session' });
            }

            // Register camera
            db.run(
                'INSERT INTO cameras (user_id, camera_id, name, rtsp_url, status, last_seen) VALUES (?, ?, ?, ?, "online", datetime("now"))',
                [session.user_id, cameraId, session.camera_name, rtspUrl],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            // Update existing camera
                            db.run(
                                'UPDATE cameras SET rtsp_url = ?, status = "online", last_seen = datetime("now") WHERE camera_id = ?',
                                [rtspUrl, cameraId],
                                (updateErr) => {
                                    if (updateErr) {
                                        return res.status(500).json({ error: 'Failed to update camera' });
                                    }
                                    markSessionUsed(sessionId);
                                    res.json({ success: true, message: 'Camera updated successfully' });
                                }
                            );
                        } else {
                            return res.status(500).json({ error: 'Failed to register camera' });
                        }
                    } else {
                        markSessionUsed(sessionId);
                        res.json({ success: true, message: 'Camera registered successfully' });
                    }
                }
            );
        }
    );
});

// Mark setup session as used
function markSessionUsed(sessionId) {
    db.run('UPDATE setup_sessions SET used = TRUE WHERE session_id = ?', [sessionId]);
}

// Get user's cameras
app.get('/api/cameras', authenticateToken, (req, res) => {
    db.all(
        'SELECT id, camera_id, name, rtsp_url, status, last_seen FROM cameras WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.userId],
        (err, cameras) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch cameras' });
            }
            res.json(cameras);
        }
    );
});

// Delete camera
app.delete('/api/cameras/:cameraId', authenticateToken, (req, res) => {
    const { cameraId } = req.params;

    db.run(
        'DELETE FROM cameras WHERE camera_id = ? AND user_id = ?',
        [cameraId, req.user.userId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to delete camera' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Camera not found' });
            }

            // Stop stream if active
            stopStream(cameraId);

            res.json({ success: true });
        }
    );
});

// Start stream
app.post('/api/stream/start/:cameraId', authenticateToken, (req, res) => {
    const { cameraId } = req.params;

    db.get(
        'SELECT * FROM cameras WHERE camera_id = ? AND user_id = ?',
        [cameraId, req.user.userId],
        (err, camera) => {
            if (err || !camera) {
                return res.status(404).json({ error: 'Camera not found' });
            }

            if (activeStreams.has(cameraId)) {
                const hlsUrl = `/streams/${cameraId}/playlist.m3u8`;
                return res.json({ 
                    success: true, 
                    message: 'Stream already active',
                    hlsUrl: hlsUrl,
                    rtspUrl: camera.rtsp_url 
                });
            }

            // Start HLS conversion from RTSP
            startStream(cameraId, camera.rtsp_url);
            
            const hlsUrl = `/streams/${cameraId}/playlist.m3u8`;
            res.json({ 
                success: true, 
                message: 'Stream started', 
                hlsUrl: hlsUrl,
                rtspUrl: camera.rtsp_url 
            });
        }
    );
});

// Stop stream
app.post('/api/stream/stop/:cameraId', authenticateToken, (req, res) => {
    const { cameraId } = req.params;

    if (!activeStreams.has(cameraId)) {
        return res.status(400).json({ error: 'Stream not active' });
    }

    stopStream(cameraId);
    res.json({ success: true, message: 'Stream stopped' });
});

// Stream management functions
function startStream(cameraId, rtspUrl) {
    if (activeStreams.has(cameraId)) {
        console.log(`Stream already active for camera ${cameraId}`);
        return;
    }

    console.log(`Starting HLS stream for camera ${cameraId}`);
    
    // Create HLS output directory
    const hlsDir = path.join(__dirname, 'public', 'streams', cameraId);
    if (!require('fs').existsSync(hlsDir)) {
        require('fs').mkdirSync(hlsDir, { recursive: true });
    }

    const playlistPath = path.join(hlsDir, 'playlist.m3u8');
    const segmentPattern = path.join(hlsDir, 'segment_%03d.ts');

    const command = ffmpeg(rtspUrl)
        .inputOptions([
            '-rtsp_transport', 'tcp',
            '-buffer_size', '64000',
            '-max_delay', '0'
        ])
        .outputOptions([
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '6',
            '-hls_flags', 'delete_segments',
            '-codec:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-crf', '25',
            '-maxrate', '1000k',
            '-bufsize', '2000k',
            '-vf', 'scale=640:480',
            '-r', '15',
            '-g', '30',
            '-keyint_min', '30',
            '-codec:a', 'aac',
            '-b:a', '64k',
            '-ac', '1',
            '-ar', '44100'
        ])
        .output(playlistPath);

    activeStreams.set(cameraId, {
        command: command,
        hlsDir: hlsDir,
        playlistPath: playlistPath
    });

    command.on('start', (commandLine) => {
        console.log(`HLS stream started for camera ${cameraId}`);
        console.log('FFmpeg command:', commandLine);
    });

    command.on('error', (err) => {
        console.error(`Stream error for camera ${cameraId}:`, err.message);
        stopStream(cameraId);
    });

    command.on('end', () => {
        console.log(`Stream ended for camera ${cameraId}`);
        stopStream(cameraId);
    });

    command.run();
}

function stopStream(cameraId) {
    const streamData = activeStreams.get(cameraId);
    if (streamData) {
        if (streamData.command) {
            streamData.command.kill('SIGTERM');
        }
        
        // Clean up HLS files
        if (streamData.hlsDir) {
            try {
                const fs = require('fs');
                if (fs.existsSync(streamData.hlsDir)) {
                    fs.rmSync(streamData.hlsDir, { recursive: true, force: true });
                }
            } catch (err) {
                console.error(`Error cleaning up HLS files for ${cameraId}:`, err.message);
            }
        }
        
        activeStreams.delete(cameraId);
        console.log(`Stream stopped for camera ${cameraId}`);
    }
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('startStream', ({ cameraId, rtspUrl }) => {
        startStream(cameraId, rtspUrl, socket);
    });

    socket.on('stopStream', ({ cameraId }) => {
        const clients = streamClients.get(cameraId);
        if (clients) {
            clients.delete(socket.id);
            if (clients.size === 0) {
                stopStream(cameraId);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Remove client from all streams
        for (const [cameraId, clients] of streamClients.entries()) {
            clients.delete(socket.id);
            if (clients.size === 0) {
                stopStream(cameraId);
            }
        }
    });
});

// Clean up expired setup sessions periodically
setInterval(() => {
    db.run('DELETE FROM setup_sessions WHERE expires_at < datetime("now")');
}, 5 * 60 * 1000); // Every 5 minutes

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    
    // Stop all active streams
    for (const cameraId of activeStreams.keys()) {
        stopStream(cameraId);
    }
    
    // Close database
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Main page: http://localhost:${PORT}`);
    console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`Setup: http://localhost:${PORT}/setup`);
});
