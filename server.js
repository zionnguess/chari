require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const baseUrl = process.env.BASE_URL;
if (isProduction ) throw new Error('BASE_URL doit être définie en production.');
const BASE_URL = baseUrl.replace(/\/$/, '');
const PAYTECH_URL = 'https://paytech.sn/api/payment/request-payment';
const PAYTECH_STATUS_URL = 'https://paytech.sn/api/payment/get-status';
const DATA_FILE = path.join(__dirname, 'data', 'donations.json');

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: 0, message: 'Trop de demandes. Veuillez réessayer dans quelques minutes.' }
});

function readDonations() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeDonations(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
}

function addDonation(record) {
  const items = readDonations();
  items.push(record);
  writeDonations(items);
}

function updateDonation(ref, patch) {
  const items = readDonations();
  const index = items.findIndex(x => x.ref_command === ref);
  if (index === -1) return false;
  items[index] = { ...items[index], ...patch, updated_at: new Date().toISOString() };
  writeDonations(items);
  return true;
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function verifyPaytechIPN(body) {
  const apiKey = process.env.PAYTECH_API_KEY;
  const apiSecret = process.env.PAYTECH_API_SECRET;
  if (!apiKey || !apiSecret) return false;

  const itemPrice = body.final_item_price ?? body.item_price;
  const ref = body.ref_command;
  const receivedHmac = body.hmac_compute;

  if (receivedHmac && itemPrice != null && ref) {
    const message = `${itemPrice}|${ref}|${apiKey}`;
    const expected = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
    return safeEqual(expected, receivedHmac);
  }

  const expectedKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const expectedSecretHash = crypto.createHash('sha256').update(apiSecret).digest('hex');
  return safeEqual(expectedKeyHash, body.api_key_sha256) && safeEqual(expectedSecretHash, body.api_secret_sha256);
}

function decodeCustomField(value) {
  if (!value) return {};
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    try { return JSON.parse(value); } catch { return {}; }
  }
}

app.get('/api/health', (req, res) => {
  res.json({ success: 1, service: 'un-cartable-un-avenir', paytechConfigured: Boolean(process.env.PAYTECH_API_KEY && process.env.PAYTECH_API_SECRET), env: process.env.PAYTECH_ENV || 'prod' });
});

app.post('/api/paytech/create-payment', paymentLimiter, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const name = String(req.body.name || '').trim().slice(0, 120);
    const email = String(req.body.email || '').trim().slice(0, 160);

    if (!Number.isInteger(amount) || amount < 100 || amount > 50000000) {
      return res.status(400).json({ success: 0, message: 'Le montant doit être un nombre entier compris entre 100 et 50 000 000 FCFA.' });
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: 0, message: 'Adresse email invalide.' });
    }
    if (!process.env.PAYTECH_API_KEY || !process.env.PAYTECH_API_SECRET) {
      return res.status(503).json({ success: 0, message: 'PayTech n’est pas encore configuré sur le serveur. Ajoutez les clés dans .env.' });
    }

    const ref = `CPT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const customField = Buffer.from(JSON.stringify({ campaign: 'Un Cartable, Un Avenir', donor_name: name, donor_email: email, ref_command: ref })).toString('base64');

    const payload = {
      item_name: 'Don — Un Cartable, Un Avenir',
      item_price: amount,
      currency: 'XOF',
      ref_command: ref,
      command_name: `Soutien campagne Un Cartable, Un Avenir — ${ref}`,
      env: process.env.PAYTECH_ENV || 'test',
      ipn_url: `${BASE_URL}/api/paytech/ipn`,
      success_url: `${BASE_URL}/paiement/succes`,
      cancel_url: `${BASE_URL}/paiement/annule`,
      custom_field: customField
    };

    const response = await fetch(PAYTECH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        API_KEY: process.env.PAYTECH_API_KEY,
        API_SECRET: process.env.PAYTECH_API_SECRET
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || Number(data.success) !== 1 || !(data.redirect_url || data.redirectUrl)) {
      console.error('PayTech create-payment error:', data);
      return res.status(502).json({ success: 0, message: data.message || 'PayTech n’a pas pu créer le paiement.' });
    }

    const redirectUrl = data.redirect_url || data.redirectUrl;
    addDonation({
      ref_command: ref,
      token: data.token || null,
      amount,
      currency: 'XOF',
      donor_name: name,
      donor_email: email,
      status: 'pending',
      env: process.env.PAYTECH_ENV || 'test',
      created_at: new Date().toISOString()
    });

    return res.json({ success: 1, redirect_url: redirectUrl, token: data.token || null, reference: ref });
  } catch (error) {
    console.error('create-payment:', error.message);
    return res.status(500).json({ success: 0, message: 'Erreur interne lors de la création du paiement.' });
  }
});

app.post('/api/paytech/ipn', (req, res) => {
  try {
    if (!verifyPaytechIPN(req.body)) return res.status(403).send('Forbidden');

    const body = req.body;
    const ref = body.ref_command;
    const type = body.type_event;
    const custom = decodeCustomField(body.custom_field);
    const finalAmount = Number(body.final_item_price ?? body.item_price ?? 0);

    if (!ref) return res.status(400).send('Missing ref_command');

    if (type === 'sale_complete') {
      updateDonation(ref, {
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: body.payment_method || null,
        client_phone: body.client_phone || null,
        final_amount: finalAmount,
        token: body.token || null,
        custom: custom
      });
    } else if (type === 'sale_canceled') {
      updateDonation(ref, {
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        payment_method: body.payment_method || null,
        token: body.token || null
      });
    }

    return res.status(200).send('IPN OK');
  } catch (error) {
    console.error('IPN:', error.message);
    return res.status(500).send('IPN ERROR');
  }
});

app.get('/api/paytech/status/:token', paymentLimiter, async (req, res) => {
  try {
    if (!process.env.PAYTECH_API_KEY || !process.env.PAYTECH_API_SECRET) return res.status(503).json({ success: 0, message: 'PayTech non configuré.' });
    const token = String(req.params.token || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!token) return res.status(400).json({ success: 0, message: 'Token invalide.' });

    const response = await fetch(`${PAYTECH_STATUS_URL}?token_payment=${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json', API_KEY: process.env.PAYTECH_API_KEY, API_SECRET: process.env.PAYTECH_API_SECRET }
    });
    const data = await response.json().catch(() => ({}));
    return res.status(response.ok ? 200 : 502).json(data);
  } catch (error) {
    return res.status(500).json({ success: 0, message: 'Impossible de vérifier le statut.' });
  }
});

app.get('/paiement/succes', (req, res) => res.sendFile(path.join(__dirname, 'public', 'success.html')));
app.get('/paiement/annule', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cancel.html')));

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✓ Un Cartable, Un Avenir: ${BASE_URL}`);
  console.log(`✓ PayTech environment: ${process.env.PAYTECH_ENV || 'test'}`);
  console.log(`✓ API health: ${BASE_URL}/api/health\n`);
});
