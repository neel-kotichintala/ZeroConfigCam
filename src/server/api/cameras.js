const express = require('express');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const db = require('../database/connection');

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

    // POST /api/setup - Generate a simple reusable QR code with just WiFi credentials
    router.post('/setup', async (req, res) => {
        try {
            const { wifi_ssid, wifi_password } = req.body;
            const userId = req.user.id;

            // QR code contains ONLY WiFi credentials - super simple!
            const qrData = `S:${wifi_ssid};P:${wifi_password}`;
            const qrCodeDataUrl = await QRCode.toDataURL(qrData);

            // Save QR code to database
            const sql = `INSERT INTO qr_codes (user_id, wifi_ssid, wifi_password, qr_data) VALUES (?, ?, ?, ?)`;
            db.run(sql, [userId, wifi_ssid, wifi_password, qrCodeDataUrl], function(err) {
                if (err) {
                    console.error('Error saving QR code:', err);
                    // Continue anyway - don't fail the request
                }
            });

            res.json({
                qrCode: qrCodeDataUrl,
                message: 'QR code generated and saved! This code can be reused for any camera.',
                reusable: true
            });
        } catch (error) {
            console.error('Error generating QR code:', error);
            res.status(500).json({ error: 'Failed to generate QR code.' });
        }
    });

    // GET /api/qr-codes - Get user's saved QR codes
    router.get('/qr-codes', (req, res) => {
        const userId = req.user.id;
        
        const sql = `SELECT id, wifi_ssid, qr_data, created_at FROM qr_codes WHERE user_id = ? ORDER BY created_at DESC`;
        db.all(sql, [userId], (err, rows) => {
            if (err) {
                console.error('Error fetching QR codes:', err);
                return res.status(500).json({ error: 'Failed to fetch QR codes.' });
            }
            
            res.json({ qrCodes: rows });
        });
    });

    // DELETE /api/qr-codes/:id - Delete a saved QR code
    router.delete('/qr-codes/:id', (req, res) => {
        const qrCodeId = req.params.id;
        const userId = req.user.id;
        
        const sql = `DELETE FROM qr_codes WHERE id = ? AND user_id = ?`;
        db.run(sql, [qrCodeId, userId], function(err) {
            if (err) {
                console.error('Error deleting QR code:', err);
                return res.status(500).json({ error: 'Failed to delete QR code.' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'QR code not found.' });
            }
            
            res.json({ message: 'QR code deleted successfully.' });
        });
    });

    // GET /api/user - Get current user's information
    router.get('/user', (req, res) => {
        res.json({ username: req.user.username });
    });



    // Manual claim endpoint removed - cameras are now auto-added

    // PUT /api/camera/:id/rename - Rename a camera
    router.put('/camera/:id/rename', (req, res) => {
        const cameraId = req.params.id;
        const userId = req.user.id;
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Camera name is required.' });
        }

        db.get('SELECT user_id FROM cameras WHERE camera_id = ?', [cameraId], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            if (!row) return res.status(404).json({ error: 'Camera not found.' });
            if (row.user_id !== userId) return res.status(403).json({ error: 'Forbidden.' });

            db.run('UPDATE cameras SET name = ? WHERE camera_id = ?', [name.trim(), cameraId], function (dbErr) {
                if (dbErr) return res.status(500).json({ error: 'Failed to rename camera.' });

                // Update activeCameras
                if (activeCameras[cameraId]) {
                    activeCameras[cameraId].name = name.trim();
                }

                // Notify all connected clients for this user
                io.to(String(userId)).emit('cameraStatusUpdate', { 
                    cameraId, 
                    status: activeCameras[cameraId]?.status || 'offline', 
                    name: name.trim() 
                });

                res.status(200).json({ message: 'Camera renamed successfully.' });
            });
        });
    });

    // DELETE /api/camera/:id - Delete a camera
    router.delete('/camera/:id', (req, res) => {
        const cameraId = req.params.id;
        const userId = req.user.id;

        db.get('SELECT user_id FROM cameras WHERE camera_id = ?', [cameraId], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error.' });
            if (!row) return res.status(404).json({ error: 'Camera not found.' });
            if (row.user_id !== userId) return res.status(403).json({ error: 'Forbidden.' });

            db.run('DELETE FROM cameras WHERE camera_id = ?', [cameraId], function (dbErr) {
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
