const express = require('express');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { query } = require('../database/connection');

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
      try {
        await query(
          'INSERT INTO qr_codes (user_id, wifi_ssid, wifi_password, qr_data) VALUES ($1, $2, $3, $4)',
          [userId, wifi_ssid, wifi_password, qrCodeDataUrl]
        );
      } catch (err) {
        console.error('Error saving QR code:', err);
      }

      res.json({
        qrCode: qrCodeDataUrl,
        message: 'QR code generated and saved! This code can be reused for any camera.',
        reusable: true,
      });
    } catch (error) {
      console.error('Error generating QR code:', error);
      res.status(500).json({ error: 'Failed to generate QR code.' });
    }
  });

  // GET /api/qr-codes - Get user's saved QR codes
  router.get('/qr-codes', async (req, res) => {
    const userId = req.user.id;

    try {
      const { rows } = await query(
        'SELECT id, wifi_ssid, qr_data, created_at FROM qr_codes WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      res.json({ qrCodes: rows });
    } catch (err) {
      console.error('Error fetching QR codes:', err);
      return res.status(500).json({ error: 'Failed to fetch QR codes.' });
    }
  });

  // DELETE /api/qr-codes/:id - Delete a saved QR code
  router.delete('/qr-codes/:id', async (req, res) => {
    const qrCodeId = req.params.id;
    const userId = req.user.id;

    try {
      const result = await query('DELETE FROM qr_codes WHERE id = $1 AND user_id = $2', [qrCodeId, userId]);
      // result.rowCount indicates number of rows deleted
      if (result.rowCount === 0) return res.status(404).json({ error: 'QR code not found.' });
      res.json({ message: 'QR code deleted successfully.' });
    } catch (err) {
      console.error('Error deleting QR code:', err);
      return res.status(500).json({ error: 'Failed to delete QR code.' });
    }
  });

  // GET /api/user - Get current user's information
  router.get('/user', (req, res) => {
    res.json({ username: req.user.username });
  });

  // PUT /api/camera/:id/rename - Rename a camera
  router.put('/camera/:id/rename', async (req, res) => {
    const cameraId = req.params.id;
    const userId = req.user.id;
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Camera name is required.' });
    }

    try {
      const { rows } = await query('SELECT user_id FROM cameras WHERE camera_id = $1', [cameraId]);
      const row = rows[0];
      if (!row) return res.status(404).json({ error: 'Camera not found.' });
      if (row.user_id !== userId) return res.status(403).json({ error: 'Forbidden.' });
      await query('UPDATE cameras SET name = $1 WHERE camera_id = $2', [name.trim(), cameraId]);
      if (activeCameras[cameraId]) activeCameras[cameraId].name = name.trim();
      io.to(String(userId)).emit('cameraStatusUpdate', {
        cameraId,
        status: activeCameras[cameraId]?.status || 'offline',
        name: name.trim(),
      });
      res.status(200).json({ message: 'Camera renamed successfully.' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to rename camera.' });
    }
  });

  // DELETE /api/camera/:id - Delete a camera
  router.delete('/camera/:id', async (req, res) => {
    const cameraId = req.params.id;
    const userId = req.user.id;

    try {
      const { rows } = await query('SELECT user_id FROM cameras WHERE camera_id = $1', [cameraId]);
      const row = rows[0];
      if (!row) return res.status(404).json({ error: 'Camera not found.' });
      if (row.user_id !== userId) return res.status(403).json({ error: 'Forbidden.' });
      await query('DELETE FROM cameras WHERE camera_id = $1', [cameraId]);
      if (activeCameras[cameraId]) delete activeCameras[cameraId];
      io.to(String(userId)).emit('cameraStatusUpdate', { cameraId, status: 'deleted' });
      res.status(200).json({ message: 'Camera deleted successfully.' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete camera.' });
    }
  });

  return router;
}

module.exports = createCameraRouter;

