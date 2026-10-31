const path = require('path');
const fs = require('fs');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

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

// Initialize Supabase client via HTTPS
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Verify database connection on startup
async function testConnection() {
  const { data, error } = await supabase.from('users').select('id').limit(1);
  if (error) {
    console.error('Database connection error:', error.message);
  } else {
    console.log('Connected to Supabase PostgreSQL Database via HTTPS!');
  }
}
testConnection();

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
    const { data: existingUsers, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', phone);

    if (checkError) throw checkError;

    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({ error: 'Phone number is already registered.' });
    }

    const saltRounds = 10;
    const pinHash = await bcrypt.hash(pin, saltRounds);
    const amount = plan === 'daily' ? 500 : 1000;
    const selectedPaymentMethod = payment_method || 'mtn';

    const { error: insertError } = await supabase
      .from('users')
      .insert([
        {
          phone_number: phone,
          pin_hash: pinHash,
          plan: plan,
          payment_method: selectedPaymentMethod,
          payment_status: 'pending'
        }
      ]);

    if (insertError) throw insertError;

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

app.post('/api/login', async (req, res) => {
  const { phone, pin } = req.body;

  if (!phone || !pin) {
    return res.status(400).json({ error: 'Phone number and PIN are required.' });
  }

  try {
    const { data: users, error: queryError } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', phone);

    if (queryError) throw queryError;
    
    if (!users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid phone number or PIN.' });
    }

    const user = users[0];
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

app.get('/api/questions', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'questions-secA.json');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Questions file not found.' });
    }

    const fileData = fs.readFileSync(filePath, 'utf8');
    const questions = JSON.parse(fileData);

    const shuffled = [...questions].sort(() => 0.5 - Math.random());
    const selectedQuestions = shuffled.slice(0, 20);

    return res.json({
      success: true,
      questions: selectedQuestions
    });
  } catch (err) {
    console.error('Error reading local questions file:', err);
    return res.status(500).json({ error: 'Internal server error loading questions.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});