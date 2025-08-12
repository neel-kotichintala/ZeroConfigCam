const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../database/connection.js');

const router = express.Router();

// POST /api/register
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    const hashedPassword = await bcryptjs.hash(password, 10);
    try {
      const result = await query(
        'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id',
        [username, email, hashedPassword]
      );
      const userId = result.rows[0].id;
      const token = jwt.sign({ id: userId, username: username }, process.env.JWT_SECRET, { expiresIn: '24h' });
      res.status(201).json({ message: 'User registered successfully.', token, username });
    } catch (err) {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// POST /api/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body; // This can be username or email
  try {
    const { rows } = await query('SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1', [username]);
    const user = rows[0];
    if (!user || !(await bcryptjs.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username });
  } catch (e) {
    res.status(500).json({ error: 'Server error during login.' });
  }
});

module.exports = router;

