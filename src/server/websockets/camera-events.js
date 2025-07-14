const url = require('url');
const db = require('../database/connection');

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
                    wss.emit('connection', ws, request, row); // Pass session row to connection handler
                });
            } else {
                console.log(`No valid setup session found for ID: ${sessionId}. Destroying socket.`);
                socket.destroy();
            }
        });
    });

    // Handle new camera connections
    wss.on('connection', (ws, req, session) => {
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });
        const { user_id, camera_name } = session;
        const cameraId = session.session_id;

        // Add or update camera in the database (upsert)
        const sql = `
            INSERT INTO cameras (camera_id, user_id, name, status) 
            VALUES (?, ?, ?, 'online')
            ON CONFLICT(camera_id) DO UPDATE SET
                name = excluded.name,
                status = 'online';
        `;
        db.run(sql, [cameraId, user_id, camera_name], (err) => {
            if (err) {
                console.error('Error upserting camera in DB:', err);
            }
        });

        activeCameras[cameraId] = { name: camera_name, userId: user_id, status: 'online' };
        console.log(`Camera '${camera_name}' connected for user ${user_id}.`);

        // Notify the dashboard
        io.to(String(user_id)).emit('cameraStatusUpdate', { cameraId, status: 'online', name: camera_name });

        // Notify the setup page that this specific session was successful
        io.to(String(user_id)).emit('setupSuccess', { cameraId, name: camera_name });

        ws.on('message', (message) => {
            io.to(String(user_id)).emit('stream', { cameraId, frame: message });
        });

        ws.on('close', () => {
            console.log(`Camera '${camera_name}' disconnected.`);
            delete activeCameras[cameraId];
            // Update status in DB
            db.run('UPDATE cameras SET status = ? WHERE camera_id = ?', ['offline', cameraId]);
            io.to(String(user_id)).emit('cameraStatusUpdate', { cameraId, status: 'offline', name: camera_name });
        });
    });
}

module.exports = initializeCameraSockets;
