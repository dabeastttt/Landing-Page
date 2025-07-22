require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files from /public

// Helper: format phone number to E.164 with +61 for Australia
function formatPhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) return `+61${cleaned.slice(1)}`;
  if (cleaned.startsWith('61')) return `+${cleaned}`;
  if (phone.startsWith('+')) return phone;
  return `+${cleaned}`;
}

// Helper: delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: send SMS with retry logic
async function sendSmsWithRetry(msg, to, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await client.messages.create({
        body: msg,
        from: process.env.TWILIO_PHONE,
        to: to
      });
      return; // success
    } catch (err) {
      console.error(`❌ Failed to send SMS (Attempt ${attempt + 1}):`, err.message);
      if (attempt === maxRetries) throw err;
      await delay(1000); // wait before retrying
    }
  }
}

// POST /send-sms route
app.post('/send-sms', async (req, res) => {
  const { name, business, email, phone } = req.body;

  if (!phone) return res.status(400).send('Phone number required');

 
 const formattedPhone = formatPhone(phone);

 const smsMessages = [
  `G'day ${name || 'mate'}! You’re officially on the waitlist for TradeAssist A.I 👷‍♂️`,
  `Here’s what’s coming: When you miss a call, your A.I. replies like this 👇`,
  `"Hi, this is ${business}’s A.I assistant. They’re on the tools right now — You can book a job, get a quote, or ask a question by replying here ✍🏽."`,
  `✅ Setup is simple: Call forward your number to your assigned A.I. number — no apps, no logins. Just smart, automatic replies and daily SMS updates. We’re building something game-changing for tradies too busy to answer the phone, and you’ll be one of the first to try it 🔥`,
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

    // Send SMS messages one by one
    for (const msg of smsMessages) {
      await sendSmsWithRetry(msg, formattedPhone);
      await delay(1000); // 1s delay between messages
    }

    // ✅ Redirect to success page
    res.redirect('/success');
  } catch (err) {
    console.error('❌ Error during signup:', err.message);
    res.status(500).send('Failed to onboard user');
  }
});

// GET /signup-count route
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

// ✅ Serve success page from public directory
app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
