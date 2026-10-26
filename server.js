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

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

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

pool.connect((err) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Connected to Supabase PostgreSQL Database!');
  }
});

// 4. Endpoint: Register User & Provide USSD Payment Instructions
app.post('/api/register', async (req, res) => {
  const { phone, pin, plan, payment_method } = req.body;

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Phone number must be exactly 10 digits.' });
  }
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
  }
  if (!['daily', 'monthly'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid subscription plan selected.' });
  }

  try {
    const userCheck = await pool.query('SELECT id FROM users WHERE phone_number = $1', [phone]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Phone number is already registered.' });
    }

    const saltRounds = 10;
    const pinHash = await bcrypt.hash(pin, saltRounds);
    const amount = plan === 'daily' ? 500 : 1000;
    const selectedPaymentMethod = payment_method || 'mtn';

    const insertQuery = `
      INSERT INTO users (phone_number, pin_hash, plan, payment_method, payment_status)
      VALUES ($1, $2, $3, $4, 'pending') RETURNING id;
    `;
    await pool.query(insertQuery, [phone, pinHash, plan, selectedPaymentMethod]);

    return res.status(201).json({ 
      success: true, 
      message: 'Account created! Please complete payment to activate access.',
      amount: amount,
      plan: plan
    });

  } catch (err) {
    console.error('Registration Error:', err);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// 5. Endpoint: SMS Forwarder Webhook (Receives Incoming MTN/Airtel Payments)
app.post('/api/payments/sms-webhook', async (req, res) => {
  const { secret, sender, message, text } = req.body;
  const rawText = message || text || '';

  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Unauthorized webhook request.' });
  }

  try {
    console.log('Incoming SMS payload:', req.body);

    const amountMatch = rawText.match(/(\d{1,3}(,\d{3})*|\d+)\s*(RWF|FRW)/i);
    const phoneMatch = rawText.match(/(07[2389]\d{7}|\+2507[2389]\d{7})/);

    if (!amountMatch || !phoneMatch) {
      return res.status(400).json({ error: 'Could not parse amount or phone number from SMS.' });
    }

    let extractedAmount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
    let payerPhone = phoneMatch[1];

    if (payerPhone.startsWith('+250')) {
      payerPhone = '0' + payerPhone.slice(4);
    }

    let planType = extractedAmount >= 1000 ? 'monthly' : 'daily';
    let durationDays = planType === 'monthly' ? 30 : 1;

    const userResult = await pool.query('SELECT id, subscription_expires_at FROM users WHERE phone_number = $1', [payerPhone]);
    
    if (userResult.rows.length === 0) {
      console.log(`Payment received from unregistered number: ${payerPhone}`);
      return res.status(404).json({ error: 'Payer phone number not found in user database.' });
    }

    const user = userResult.rows[0];
    const now = new Date();
    let currentExpiry = user.subscription_expires_at ? new Date(user.subscription_expires_at) : now;
    let baseDate = currentExpiry > now ? currentExpiry : now;
    
    baseDate.setDate(baseDate.getDate() + durationDays);

    await pool.query(
      `UPDATE users 
       SET payment_status = 'active', 
           plan = $1, 
           subscription_expires_at = $2 
       WHERE id = $3`,
      [planType, baseDate, user.id]
    );

    console.log(`Successfully activated ${planType} subscription for user ${payerPhone} until ${baseDate}`);
    return res.status(200).json({ success: true, message: 'Payment processed and subscription activated.' });

  } catch (err) {
    console.error('Webhook Processing Error:', err);
    return res.status(500).json({ error: 'Internal server error processing webhook.' });
  }
});

// 6. Endpoint: Authenticate User Login & Check Subscription Status
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

    const now = new Date();
    const isExpired = user.subscription_expires_at ? new Date(user.subscription_expires_at) < now : true;

    return res.json({
      success: true,
      message: 'Login successful!',
      isSubscribed: !isExpired,
      user: {
        id: user.id,
        phone_number: user.phone_number,
        plan: user.plan,
        subscription_expires_at: user.subscription_expires_at
      }
    });

  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// 7. Endpoint: Reset User PIN
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

// 8. Endpoint: Fetch 20 Random Questions
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

// 9. Endpoint: Fetch Last 5 Test Results for User
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

// 10. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});