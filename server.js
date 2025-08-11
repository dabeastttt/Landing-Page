require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const twilio = require('twilio');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Twilio
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Rate limiting middleware
const smsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per minute
  message: 'Too many requests. Please try again later.'
});

// Format phone numbers
function formatPhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) return `+61${cleaned.slice(1)}`;
  if (cleaned.startsWith('61')) return `+${cleaned}`;
  if (phone.startsWith('+')) return phone;
  return `+${cleaned}`;
}

// Phone validation (Australian mobiles only)
function isValidAUSMobile(phone) {
  return /^\+61[0-9]{9}$/.test(phone);
}

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Send SMS with retry
async function sendSmsWithRetry(msg, to, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await client.messages.create({
        body: msg,
        from: process.env.TWILIO_PHONE,
        to: to
      });
      return;
    } catch (err) {
      console.error(`❌ Failed to send SMS (Attempt ${attempt + 1}):`, err.message);
      if (attempt === maxRetries) throw err;
      await delay(2500);
    }
  }
}

// POST /send-sms
app.post('/send-sms', smsLimiter, async (req, res) => {
  const { name, business, email, phone, honeypot, signupTime } = req.body;

  if (!phone) return res.status(400).send('Phone number required');

  const formattedPhone = formatPhone(phone);
  if (!isValidAUSMobile(formattedPhone)) {
    return res.status(400).send('Invalid Australian mobile number');
  }

  const displayName = name?.trim() || 'legend';
  const businessName = business?.trim() || 'your tradie';

  const smsMessages = [
    `G'day ${displayName}, you're in the TradeAssist waitlist!`,
    `When you miss a call, our AI replies instantly.`,
    `Hi, this is ${businessName}’s AI assistant. On the tools right now — reply here to book a job, get a quote, or ask a question.`,
    `Setup’s easy. No apps, no logins. Just your number. Too easy.`
  ];

  try {
    // Save to Supabase
    const { error } = await supabase.from('signups').insert([
      { name, business, email, phone: formattedPhone }
    ]);
    if (error) {
      console.error('❌ Supabase insert error:', error.message);
      return res.status(500).send('Database error');
    }

    // Send SMS messages with delay
    for (const msg of smsMessages) {
      await sendSmsWithRetry(msg, formattedPhone);
      await delay(1500);
    }

    res.redirect('/success');
  } catch (err) {
    console.error('❌ Error during signup:', err.message);
    res.status(500).send('Failed to onboard user');
  }
});

// GET /signup-count
app.get('/signup-count', async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('signups')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (error) {
    console.error('Error fetching signup count:', error.message);
    res.status(500).json({ error: 'Failed to get signup count' });
  }
});

 GET /success
  app.get('/success', (req, res) => {
   res.sendFile(path.join(__dirname, 'public', 'success.html'));
  });

// Start server
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`✅ Server running at http://${host}:${port}`);
});

