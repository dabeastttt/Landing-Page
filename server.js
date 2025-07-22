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

// POST /send-sms route
app.post('/send-sms', async (req, res) => {
  const { name, business, email, phone } = req.body;

  if (!phone) return res.status(400).send('Phone number required');

  const formattedPhone = formatPhone(phone);

  const smsMessages = [
  `G'day ${name || 'mate'}! You’re officially on the waitlist for TradeAssist A.I 👷‍♂️`,
  `We’re building something game-changing for tradies who are too busy to answer the phone — and you’ll be one of the first to try it.`,
  `Here’s what’s coming: When you miss a call, your A.I. instantly replies like this 👇`,
  `"Hi, this is ${business}’s A.I assistant. They’re on the tools right now — You can book a job, get a quote, or ask a question by replying here ✍🏽."`,
  `✅ Setup’s dead simple — just call forward your number to your A.I. number. It works straight out of the box on both Apple and Android. No stress.`,
  `💡 Once that’s done, it’s set-and-forget. No apps, no logins, just smart replies to missed calls — automatically.`,
  `📲 Your A.I. handles enquiries via SMS and logs everything for you. No more lost leads.`,
  `📈 You’ll even get daily updates on how many jobs or questions came in.`,
  `🧰 And if you want to check messages manually, we’ll have a private dashboard ready for you.`,
  `🔥 We’ll be rolling out to early users over the next couple months — so hang tight, and we’ll text you as soon as you’re up!`,
];


  try {
    // Save signup to Supabase
    const { error } = await supabase.from('signups').insert([
      { name, business, email, phone: formattedPhone }
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

