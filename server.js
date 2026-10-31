const path = require('path');
const fs = require('fs');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
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

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

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
  if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Phone number must be exactly 10 digits.' });
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
  if (!['daily', 'monthly'].includes(plan)) return res.status(400).json({ error: 'Invalid subscription plan.' });

  try {
    const { data: existingUsers } = await supabase.from('users').select('id').eq('phone_number', phone);
    if (existingUsers && existingUsers.length > 0) return res.status(400).json({ error: 'Phone number already registered.' });

    const pinHash = await bcrypt.hash(pin, 10);
    const { error: insertError } = await supabase.from('users').insert([{
      phone_number: phone,
      pin_hash: pinHash,
      plan: plan,
      payment_method: payment_method || 'mtn',
      payment_status: 'pending'
    }]);

    if (insertError) throw insertError;
    return res.status(201).json({ success: true, message: 'Account created!', plan: plan });
  } catch (err) {
    console.error('Registration Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { phone, pin } = req.body;
  try {
    const { data: users } = await supabase.from('users').select('*').eq('phone_number', phone);
    if (!users || users.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

    const user = users[0];
    const pinMatch = await bcrypt.compare(pin, user.pin_hash);
    if (!pinMatch) return res.status(401).json({ error: 'Invalid credentials.' });

    return res.json({
      success: true,
      message: 'Login successful!',
      user: { id: user.id, phone_number: user.phone_number, plan: user.plan }
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard-index.html')));
app.get('/SectionA.html', (req, res) => res.sendFile(path.join(__dirname, 'SECTIONA.html')));
app.get('/roadsigns.html', (req, res) => res.sendFile(path.join(__dirname, 'RoadSigns.html')));
app.get('/RoadSigns.html', (req, res) => res.sendFile(path.join(__dirname, 'RoadSigns.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));