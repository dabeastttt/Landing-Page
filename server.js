require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const app = express();
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

// Format phone numbers
function formatPhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) return `+61${cleaned.slice(1)}`;
  if (cleaned.startsWith('61')) return `+${cleaned}`;
  if (phone.startsWith('+')) return phone;
  return `+${cleaned}`;
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
app.post('/send-sms', async (req, res) => {
  const { name, business, email, phone } = req.body;
  if (!phone) return res.status(400).send('Phone number required');

  const formattedPhone = formatPhone(phone);


  const smsMessages = [ 
    `G'day ${name || 'legend'}, you're in the TradeAssist waitlist!`,
    `When you miss a call, our AI replies instantly.`,
    `Hi, this is ${business || 'your tradie'}’s AI assistant. On the tools right now — reply here to book a job, get a quote, or ask a question.`,
    `Setup’s easy. No apps, no logins. Just your number. Too easy.`
  ];


  try {
    // Save to Supabase
    const { error } = await supabase.from('signups').insert([
      { name, business, email, phone: formattedPhone }
    ]);
    if (error) {
      console.error('❌ Supabase insert error:', error.message);
      throw error;
    }

    // Send messages with 1-second delay between each
    for (const msg of smsMessages) {
      await sendSmsWithRetry(msg, formattedPhone);
      await delay(1000); // 1 second delay
    }

    // ✅ Redirect to success page
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

// Serve success page
app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// Start server
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`✅ Server running at http://${host}:${port}`);
});
