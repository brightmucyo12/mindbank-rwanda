const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();

// 1. Configure CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// Manual preflight interceptor to guarantee Access-Control headers on OPTIONS requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 2. Body Parsing Middleware
app.use(express.json());

// Serve static frontend files with no-cache headers for HTML files
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// 3. Supabase PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test Database Connection
pool.connect((err) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Connected to Supabase PostgreSQL Database!');
  }
});

// 4. Endpoint: Register User & Save to Supabase
app.post('/api/register', async (req, res) => {
  const { phone, pin, plan, payment_method } = req.body;

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Phone number must be exactly 10 digits.' });
  }
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
  }

  try {
    const userCheck = await pool.query('SELECT id FROM users WHERE phone_number = $1', [phone]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Phone number is already registered.' });
    }

    const saltRounds = 10;
    const pinHash = await bcrypt.hash(pin, saltRounds);

    const insertQuery = `
      INSERT INTO users (phone_number, pin_hash, plan, payment_method)
      VALUES ($1, $2, $3, $4) RETURNING id;
    `;
    
    await pool.query(insertQuery, [phone, pinHash, plan, payment_method]);

    return res.status(201).json({ success: true, message: 'User registered successfully!' });

  } catch (err) {
    console.error('Registration Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 5. Endpoint: Authenticate User Login
app.post('/api/login', async (req, res) => {
  const { phone, pin } = req.body;

  if (!phone || !pin) {
    return res.status(400).json({ error: 'Phone number and PIN are required.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid phone number or PIN.' });
    }

    const user = result.rows[0];
    const pinMatch = await bcrypt.compare(pin, user.pin_hash);

    if (!pinMatch) {
      return res.status(401).json({ error: 'Invalid phone number or PIN.' });
    }

    return res.json({
      success: true,
      message: 'Login successful!',
      user: {
        id: user.id,
        phone_number: user.phone_number,
        plan: user.plan
      }
    });

  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 6. Endpoint: Reset User PIN
app.post('/api/reset-pin', async (req, res) => {
  const { phone, newPin } = req.body;

  if (!phone || !newPin) {
    return res.status(400).json({ error: 'Phone number and new PIN are required.' });
  }

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Phone number must be exactly 10 digits.' });
  }

  if (!/^\d{4}$/.test(newPin)) {
    return res.status(400).json({ error: 'New PIN must be exactly 4 digits.' });
  }

  try {
    const userCheck = await pool.query('SELECT id FROM users WHERE phone_number = $1', [phone]);
    if (userCheck.rows.length > 0) {
      const saltRounds = 10;
      const newPinHash = await bcrypt.hash(newPin, saltRounds);

      await pool.query('UPDATE users SET pin_hash = $1 WHERE phone_number = $2', [newPinHash, phone]);

      return res.json({
        success: true,
        message: 'PIN reset successful! Redirecting to login...'
      });
    } else {
      return res.status(404).json({ error: 'Phone number not found.' });
    }
  } catch (err) {
    console.error('Reset PIN Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 7. Endpoint: Fetch 20 Random Questions
app.get('/api/questions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, question_text, option_a, option_b, option_c, option_d, correct_answer, category FROM questions ORDER BY RANDOM() LIMIT 20'
    );
    
    return res.json({
      success: true,
      questions: result.rows
    });
  } catch (err) {
    console.error('Error fetching random questions:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 8. Endpoint: Fetch Last 5 Test Results for User
app.get('/api/results/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const history = await pool.query(
      `SELECT score, total_questions, created_at 
       FROM test_results 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [userId]
    );

    const stats = await pool.query(
      `SELECT COUNT(*) as total_tests, AVG(score) as avg_score 
       FROM test_results 
       WHERE user_id = $1`,
      [userId]
    );

    return res.json({
      success: true,
      history: history.rows,
      total_tests: parseInt(stats.rows[0].total_tests || 0),
      avg_score: parseFloat(stats.rows[0].avg_score || 0).toFixed(1)
    });
  } catch (err) {
    console.error('Error fetching results:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 9. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});