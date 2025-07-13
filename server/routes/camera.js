const express = require('express');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const db = require('../db/database');

function createCameraRouter(io, activeCameras) {
    const router = express.Router();

    // Middleware to authenticate all requests to this router
    router.use((req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (token == null) return res.sendStatus(401);

        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    });

    // POST /api/setup - Generate a QR code for camera setup
    router.post('/setup', async (req, res) => {
        try {
            const userId = req.user.id;
            const { wifi_ssid, wifi_password, camera_name } = req.body;
            const sessionId = Math.random().toString(36).substring(2, 10);
            const qrData = `S:${wifi_ssid};P:${wifi_password};I:${sessionId}`;
            const qrCodeDataUrl = await QRCode.toDataURL(qrData);

            const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

            db.run('INSERT INTO setup_sessions (session_id, user_id, camera_name, expires_at) VALUES (?, ?, ?, ?)', [sessionId, userId, camera_name, expiresAt.toISOString()], (err) => {
                if (err) {
                    console.error('Error creating setup session:', err);
                    return res.status(500).json({ error: 'Failed to create setup session.' });
                }
                res.json({ qrCode: qrCodeDataUrl, sessionId, expiresAt: expiresAt.toISOString() });
            });
        } catch (error) {
            console.error('Error generating QR code:', error);
            res.status(500).json({ error: 'Failed to generate QR code.' });
        }
    });

    // GET /api/user - Get current user's information
    router.get('/user', (req, res) => {
        res.json({ username: req.user.username });
    });

    // DELETE /api/camera/:id - Delete a camera
    router.delete('/camera/:id', (req, res) => {
        const cameraId = req.params.id;
        const userId = req.user.id;

        db.get('SELECT user_id FROM cameras WHERE camera_id = ?', [cameraId], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            if (!row) return res.status(404).json({ error: 'Camera not found.' });
            if (row.user_id !== userId) return res.status(403).json({ error: 'Forbidden.' });

            db.run('DELETE FROM cameras WHERE camera_id = ?', [cameraId], function(dbErr) {
                if (dbErr) return res.status(500).json({ error: 'Failed to delete camera.' });
                
                if (activeCameras[cameraId]) {
                    delete activeCameras[cameraId];
                }

                io.to(String(userId)).emit('cameraStatusUpdate', { cameraId, status: 'deleted' });
                res.status(200).json({ message: 'Camera deleted successfully.' });
            });
        });
    });

    return router;
}

module.exports = createCameraRouter;
