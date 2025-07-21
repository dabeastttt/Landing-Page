require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public')); // serve static files from /public

// Helper: format phone number to E.164 with +61 for Australia
function formatPhone(phone) {
  const cleaned = phone.replace(/\D/g, ''); // Remove non-digit chars
  if (cleaned.startsWith('0')) return `+61${cleaned.slice(1)}`;
  if (cleaned.startsWith('61')) return `+${cleaned}`;
  if (phone.startsWith('+')) return phone;
  return `+${cleaned}`;
}

// POST /send-sms route
app.post('/send-sms', async (req, res) => {
  const { name, business, email, phone, planSelect } = req.body;

  if (!phone) return res.status(400).send('Phone number required');

  const formattedPhone = formatPhone(phone);

  const smsMessages = [
    `G'day ${business || 'mate'}! Welcome to TradeAssist A.I 👷‍♂️ We're stoked to have you onboard.`,
    `Here's how it works: When you miss a call, your A.I. sends a reply like this 👇`,
    `"Hi, this is ${business}’s assistant. They’re on the tools right now — what can we help you with?"`,
  ];

  try {
    // Save signup to Supabase
    const { error } = await supabase.from('signups').insert([
      { name, business, email, phone: formattedPhone, plan: planSelect }
    ]);

    if (error) throw error;

    // Send SMS messages
    for (const msg of smsMessages) {
      await client.messages.create({
        body: msg,
        from: process.env.TWILIO_PHONE,
        to: formattedPhone
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Failed to onboard user');
  }
});

// GET /signup-count route
app.get('/signup-count', async (req, res) => {
  try {
    // head:true + count:'exact' returns count but data is null
    const { count, error } = await supabase
      .from('signups')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (error) {
    console.error('Error fetching signup count:', error);
    res.status(500).json({ error: 'Failed to get signup count' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});

