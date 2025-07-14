const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/connection.js');

const router = express.Router();

// POST /api/register
router.post('/register', async (req, res) => {
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

// POST /api/login
router.post('/login', (req, res) => {
    const { username, password } = req.body; // This can be username or email
    db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username], async (err, user) => {
        if (err || !user || !(await bcryptjs.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, username: user.username });
    });
});

module.exports = router;
