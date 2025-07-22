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

// Helper: delay execution for X milliseconds
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// POST /send-sms route
app.post('/send-sms', async (req, res) => {
  const { name, business, email, phone } = req.body;

  if (!phone) return res.status(400).send('Phone number required');

  const formattedPhone = formatPhone(phone);

const smsMessages = [
  `G'day ${name || 'mate'}! You’re officially on the waitlist for TradeAssist A.I 👷‍♂️`,
  `Here’s what’s coming: When you miss a call, your A.I. replies like this 👇`,
  `"Hi, this is ${business}’s A.I assistant. They’re on the tools right now — You can book a job, get a quote, or ask a question by replying here ✍🏽."`,
  `✅ Setup will be simple — just **call forward** your number to your assigned A.I. number.`,
  `💡 No apps or logins — just smart, automatic replies to missed calls.`,
  `📈 You’ll get daily updates, and there’ll be a private dashboard if you want to check messages manually.`,
  `🔥 We’re building something game-changing for tradies too busy to answer the phone. We’re rolling out over the next couple months — and you’ll be one of the first to try it.`,
];


  try {
    // Save signup to Supabase
    const { error } = await supabase.from('signups').insert([
      { name, business, email, phone: formattedPhone }
    ]);

    if (error) throw error;

    // Send SMS messages one by one with 1-second delay
    for (const msg of smsMessages) {
      await client.messages.create({
        body: msg,
        from: process.env.TWILIO_PHONE,
        to: formattedPhone
      });
      await delay(1000); // 1 second delay
    }

    // ✅ Redirect to success page
    res.redirect('/success');
  } catch (err) {
    console.error('Error:', err);
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
    console.error('Error fetching signup count:', error);
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
