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

        socket.on('disconnect', () => {
            console.log(`Dashboard client disconnected: ${socket.id}`);
        });
    });
}

module.exports = initializeSocketIo;
