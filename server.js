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

// Serve static frontend files if hosted alongside Express
app.use(express.static(path.join(__dirname)));

// 3. Supabase PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase SSL connection on cloud hosts like Render
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

  // Validation
  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Phone number must be exactly 10 digits.' });
  }
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
  }

  try {
    // Check if phone number is already registered
    const userCheck = await pool.query('SELECT id FROM users WHERE phone_number = $1', [phone]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Phone number is already registered.' });
    }

    // Securely hash the PIN with bcrypt
    const saltRounds = 10;
    const pinHash = await bcrypt.hash(pin, saltRounds);

    // Insert user into Supabase table
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
    // Find user by phone number
    const result = await pool.query('SELECT * FROM users WHERE phone_number = $1', [phone]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid phone number or PIN.' });
    }

    const user = result.rows[0];

    // Compare provided PIN with hashed PIN in database
    const pinMatch = await bcrypt.compare(pin, user.pin_hash);

    if (!pinMatch) {
      return res.status(401).json({ error: 'Invalid phone number or PIN.' });
    }

    // Login successful
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


// Endpoint: Fetch 20 Random Questions for a Practice Test
app.get('/api/questions', async (req, res) => {
  try {
    // RANDOM() ensures a different batch of 20 questions is picked on every request
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

// 7. Start Server
const PORT = process.env.PORT || 5000;
// Endpoint: Save Test Result
app.post('/api/results', async (req, res) => {
  const { user_id, score, total_questions } = req.body;

  if (!user_id || score === undefined) {
    return res.status(400).json({ error: 'User ID and score are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO test_results (user_id, score, total_questions) 
       VALUES ($1, $2, $3) RETURNING id, score, total_questions, created_at`,
      [user_id, score, total_questions || 20]
    );

    return res.status(201).json({ success: true, result: result.rows[0] });
  } catch (err) {
    console.error('Error saving result:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// Endpoint: Fetch Last 5 Test Results for User
app.get('/api/results/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Get last 5 tests
    const history = await pool.query(
      `SELECT score, total_questions, created_at 
       FROM test_results 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [userId]
    );

    // Get aggregated overall stats
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});