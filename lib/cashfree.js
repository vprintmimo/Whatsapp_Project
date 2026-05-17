// lib/cashfree.js
// Cashfree Payments — Order creation & status check

const axios = require('axios');

const BASE = () =>
  process.env.CASHFREE_ENV === 'PROD'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

const HEADERS = () => ({
  'Content-Type': 'application/json',
  'x-api-version': '2023-08-01',
  'x-client-id': process.env.CASHFREE_APP_ID,
  'x-client-secret': process.env.CASHFREE_SECRET_KEY,
});

// ── Create a payment order and return the payment_link ────────────────────
async function createOrder({ orderId, amount, phone, name, returnUrl }) {
  const res = await axios.post(`${BASE()}/orders`, {
    order_id: orderId,
    order_amount: amount,
    order_currency: 'INR',
    customer_details: {
      customer_id: phone.replace(/\D/g, '').slice(-10),
      customer_phone: phone,
      customer_name: name || 'Customer',
    },
    order_meta: {
      return_url: returnUrl || `${process.env.VERCEL_URL}/api/cashfree-webhook?order_id=${orderId}`,
      notify_url: `${process.env.VERCEL_URL}/api/cashfree-webhook`,
    },
  }, { headers: HEADERS() });

  return res.data; // { order_id, payment_session_id, payment_link, ... }
}

// ── Get order payment status ───────────────────────────────────────────────
async function getOrderStatus(orderId) {
  const res = await axios.get(`${BASE()}/orders/${orderId}`, {
    headers: HEADERS(),
  });
  return res.data;
}

// ── Verify Cashfree webhook signature ─────────────────────────────────────
function verifySignature(rawBody, timestamp, signature) {
  const crypto = require('crypto');
  const payload = timestamp + rawBody;
  const expected = crypto
    .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
    .update(payload)
    .digest('base64');
  return expected === signature;
}

module.exports = { createOrder, getOrderStatus, verifySignature };
