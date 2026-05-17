// lib/whatsapp.js
// Helper functions for Meta WhatsApp Cloud API

const axios = require('axios');

const BASE = () => `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}`;
const HEADERS = () => ({
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json',
});

// ── Send plain text message ────────────────────────────────────────────────
async function sendText(to, text) {
  await axios.post(`${BASE()}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  }, { headers: HEADERS() });
}

// ── Send interactive buttons (max 3 buttons) ──────────────────────────────
async function sendButtons(to, bodyText, buttons) {
  // buttons: [{ id: string, title: string }]
  await axios.post(`${BASE()}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.substring(0, 20) },
        })),
      },
    },
  }, { headers: HEADERS() });
}

// ── Send interactive list (for 4+ options) ────────────────────────────────
async function sendList(to, bodyText, sections, buttonLabel = 'Select') {
  // sections: [{ title, rows: [{ id, title, description }] }]
  await axios.post(`${BASE()}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: { button: buttonLabel, sections },
    },
  }, { headers: HEADERS() });
}

// ── Mark message as read (shows blue ticks) ───────────────────────────────
async function markRead(messageId) {
  await axios.post(`${BASE()}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  }, { headers: HEADERS() }).catch(() => {}); // Non-critical
}

// ── Get download URL for media (images, etc.) ─────────────────────────────
async function getMediaUrl(mediaId) {
  const res = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: HEADERS(),
  });
  return res.data.url;
}

// ── Download media bytes from Meta CDN ───────────────────────────────────
async function downloadMedia(url) {
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    responseType: 'arraybuffer',
  });
  return {
    data: Buffer.from(res.data),
    contentType: res.headers['content-type'] || 'image/jpeg',
  };
}

module.exports = { sendText, sendButtons, sendList, markRead, getMediaUrl, downloadMedia };
