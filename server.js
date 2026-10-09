const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Serve static frontend files if hosted alongside Express
app.use(express.static(path.join(__dirname)));

// Supabase PostgreSQL Connection Pool
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

// 1. Endpoint: Register User & Save to Supabase
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

// 2. Endpoint: Authenticate User Login
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

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});