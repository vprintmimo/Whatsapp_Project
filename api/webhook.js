// api/webhook.js
// Main WhatsApp webhook — handles all incoming messages & conversation flow

const wa   = require('../lib/whatsapp');
const fb   = require('../lib/firebase');
const cf   = require('../lib/cashfree');
const ai   = require('../lib/claude');

// ── Pricing ───────────────────────────────────────────────────────────────
const PRICES = { '4x6': 15, '5x7': 25, '8x10': 60, 'A4': 80 };

// ── Helpers ───────────────────────────────────────────────────────────────
const genOTP     = () => Math.floor(100000 + Math.random() * 900000).toString();
const genOrderId = () => 'VP' + Date.now();

function parsePhone(input) {
  const raw = input.replace(/[\s\-().]/g, '');
  const num = raw.startsWith('+91') ? raw : `+91${raw.replace(/^0/, '')}`;
  return /^\+91[6-9]\d{9}$/.test(num) ? num : null;
}

function parseSize(input) {
  const lc = input.toLowerCase();
  if (lc.includes('4x6') || lc.includes('4×6')) return '4x6';
  if (lc.includes('5x7') || lc.includes('5×7')) return '5x7';
  if (lc.includes('8x10') || lc.includes('8×10')) return '8x10';
  if (lc.includes('a4')) return 'A4';
  return null;
}

// ── Core message processor ────────────────────────────────────────────────
async function processMessage(msg, contact) {
  const phone  = msg.from;
  const msgId  = msg.id;
  const name   = contact?.profile?.name || 'there';

  // Show blue ticks
  await wa.markRead(msgId);

  // Extract input from different message types
  const textBody   = msg.type === 'text'        ? msg.text?.body?.trim()               : '';
  const btnReplyId = msg.type === 'interactive' ? msg.interactive?.button_reply?.id    : '';
  const listReplyId= msg.type === 'interactive' ? msg.interactive?.list_reply?.id      : '';
  const input      = btnReplyId || listReplyId || textBody;
  const isImage    = msg.type === 'image';

  // Load conversation state
  const state = await fb.getConversation(phone);
  const step  = state.step || 'GREET';

  console.log(`[${phone}] step=${step} input="${input}" type=${msg.type}`);

  try {
    // ── GREET / restart ─────────────────────────────────────────────────
    if (step === 'GREET' || /^(hi|hello|hey|start|hlo|order|print)\b/i.test(textBody)) {
      await fb.setConversation(phone, { step: 'PHONE', name, phone });
      await wa.sendText(phone,
        `👋 Hello ${name}! Welcome to Vision Print 🖨️\n\n` +
        `I help you order high-quality photo prints, delivered to your door.\n\n` +
        `First, please share your 10-digit WhatsApp number to verify your identity:`
      );
      return;
    }

    // ── PHONE verification ───────────────────────────────────────────────
    if (step === 'PHONE') {
      const verifiedPhone = parsePhone(input);
      if (!verifiedPhone) {
        await wa.sendText(phone, '❌ Invalid number. Please enter a valid 10-digit Indian mobile number (e.g. 9876543210):');
        return;
      }
      const otp = genOTP();
      const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
      await fb.setConversation(phone, { step: 'OTP', verifiedPhone, otp, otpExpiry });
      await wa.sendText(phone, `📲 OTP sent to ${verifiedPhone}:\n\n*${otp}*\n\n⏰ Valid for 10 minutes.`);
      return;
    }

    // ── OTP verification ─────────────────────────────────────────────────
    if (step === 'OTP') {
      if (Date.now() > state.otpExpiry) {
        await fb.setConversation(phone, { step: 'PHONE' });
        await wa.sendText(phone, '⏰ OTP expired. Please enter your number again:');
        return;
      }
      if (input !== state.otp) {
        await wa.sendText(phone, '❌ Incorrect OTP. Please try again (or type your number to resend):');
        return;
      }
      // Verified! Create order session
      const orderId = genOrderId();
      await fb.setConversation(phone, { step: 'UPLOAD', orderId });
      await fb.saveOrder(orderId, {
        orderId,
        phone,
        verifiedPhone: state.verifiedPhone,
        name: state.name || name,
        status: 'started',
      });
      await wa.sendText(phone,
        `✅ Phone verified! 🎉\n\n` +
        `Welcome to Vision Print 🖨️\n\n` +
        `📸 Please send your photo now — just attach an image to this chat.`
      );
      return;
    }

    // ── PHOTO UPLOAD ─────────────────────────────────────────────────────
    if (step === 'UPLOAD') {
      if (!isImage) {
        await wa.sendText(phone, '📸 Please send your photo by attaching an image to this chat.');
        return;
      }
      await wa.sendText(phone, '⬆️ Uploading your photo to our servers...');
      const mediaId  = msg.image.id;
      const mediaUrl = await wa.getMediaUrl(mediaId);
      const { data, contentType } = await wa.downloadMedia(mediaUrl);

      const ext  = contentType.split('/')[1] || 'jpg';
      const path = `orders/${state.orderId}/${Date.now()}.${ext}`;
      const photoURL = await fb.uploadPhoto(data, contentType, path);

      await fb.saveOrder(state.orderId, { photoURL, photoPath: path, status: 'photo_uploaded' });
      await fb.setConversation(phone, { step: 'SIZE', photoURL, photoPath: path });

      await wa.sendList(phone,
        '📷 Photo received and saved!\n\nSelect your print size:',
        [{
          title: 'Available Print Sizes',
          rows: [
            { id: '4x6',  title: '4×6 inches',  description: '₹15 per print — Wallet / Gift size' },
            { id: '5x7',  title: '5×7 inches',  description: '₹25 per print — Standard size' },
            { id: '8x10', title: '8×10 inches', description: '₹60 per print — Large display' },
            { id: 'A4',   title: 'A4 size',     description: '₹80 per print — Full page' },
          ],
        }],
        'Choose Size'
      );
      return;
    }

    // ── SIZE selection ───────────────────────────────────────────────────
    if (step === 'SIZE') {
      const size = parseSize(input);
      if (!size) {
        await wa.sendText(phone, 'Please pick a size from the list 👆');
        return;
      }
      await fb.setConversation(phone, { step: 'QTY', size });
      await wa.sendButtons(phone,
        `✅ ${size} selected — ₹${PRICES[size]} each\n\nHow many copies do you want?`,
        [
          { id: 'qty_1', title: '1 copy' },
          { id: 'qty_2', title: '2 copies' },
          { id: 'qty_5', title: '5 copies' },
        ]
      );
      return;
    }

    // ── QUANTITY ─────────────────────────────────────────────────────────
    if (step === 'QTY') {
      let qty;
      if (input?.startsWith('qty_')) qty = parseInt(input.replace('qty_', ''));
      else qty = parseInt(input);

      if (!qty || qty < 1 || qty > 99) {
        await wa.sendButtons(phone, 'How many copies?', [
          { id: 'qty_1', title: '1 copy' },
          { id: 'qty_2', title: '2 copies' },
          { id: 'qty_5', title: '5 copies' },
        ]);
        return;
      }

      const total = PRICES[state.size] * qty;
      await fb.setConversation(phone, { step: 'CONFIRM', qty, total });
      await wa.sendButtons(phone,
        `📋 Order Summary\n\n` +
        `🖼️  Size: ${state.size}\n` +
        `📦  Copies: ${qty}\n` +
        `💰  Total: ₹${total}\n\n` +
        `Confirm and proceed to payment?`,
        [
          { id: 'pay_yes', title: '✅ Pay ₹' + total },
          { id: 'pay_no',  title: '❌ Cancel' },
        ]
      );
      return;
    }

    // ── CONFIRM & pay ────────────────────────────────────────────────────
    if (step === 'CONFIRM') {
      if (input === 'pay_no' || /cancel|no/i.test(input)) {
        await fb.setConversation(phone, { step: 'UPLOAD', size: null, qty: null, total: null });
        await wa.sendText(phone, '❌ Order cancelled. Send a new photo to start again 📸');
        return;
      }

      if (input === 'pay_yes' || /pay|yes|ok/i.test(input)) {
        await wa.sendText(phone, '💳 Creating your payment link...');
        try {
          const order = await cf.createOrder({
            orderId: state.orderId,
            amount:  state.total,
            phone:   state.verifiedPhone || phone,
            name:    state.name || name,
          });

          const payLink = order.payment_link;
          await fb.saveOrder(state.orderId, {
            status: 'payment_initiated',
            size: state.size,
            qty: state.qty,
            total: state.total,
          });
          await fb.setConversation(phone, { step: 'PAYMENT_PENDING' });

          await wa.sendText(phone,
            `💳 Pay ₹${state.total} securely:\n\n${payLink}\n\n` +
            `⏰ Link is valid for 15 minutes.\n` +
            `After payment, you'll receive a confirmation here automatically. ✅`
          );
        } catch (err) {
          console.error('Cashfree error:', err.response?.data || err.message);
          await wa.sendText(phone, '⚠️ Could not generate payment link. Please try again or contact support.');
          await fb.setConversation(phone, { step: 'CONFIRM' });
        }
        return;
      }
      return;
    }

    // ── PAYMENT PENDING ──────────────────────────────────────────────────
    if (step === 'PAYMENT_PENDING') {
      await wa.sendText(phone,
        `⏳ Waiting for payment confirmation...\n\n` +
        `If you've already paid, please wait a moment — we'll message you once it's confirmed.\n\n` +
        `If you're having trouble, contact us at support@visionprint.in`
      );
      return;
    }

    // ── ORDER DONE — new order? ──────────────────────────────────────────
    if (step === 'DONE') {
      if (/new|another|more|order|print|hi|start/i.test(input)) {
        const orderId = genOrderId();
        await fb.setConversation(phone, { step: 'UPLOAD', orderId, size: null, qty: null, total: null });
        await fb.saveOrder(orderId, { orderId, phone, verifiedPhone: state.verifiedPhone, name: state.name || name, status: 'started' });
        await wa.sendText(phone, '📸 Great! Send your photo for the new order:');
        return;
      }
    }

    // ── AI FALLBACK ──────────────────────────────────────────────────────
    const reply = await ai.getAIReply(input || 'hello', step);
    await wa.sendText(phone, reply);

  } catch (err) {
    console.error(`Error processing message from ${phone}:`, err);
    await wa.sendText(phone, '⚠️ Something went wrong on our end. Please try again in a moment.').catch(() => {});
  }
}

// ── Vercel handler ────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // ── Webhook verification (Meta sends GET when you register the webhook)
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('✅ Webhook verified by Meta');
      return res.status(200).send(challenge);
    }
    console.warn('❌ Webhook verification failed — token mismatch');
    return res.status(403).end();
  }

  // ── Incoming messages (Meta sends POST)
  if (req.method === 'POST') {
    // Respond 200 immediately so Meta doesn't retry
    res.status(200).json({ status: 'ok' });

    try {
      const body = req.body;
      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (!value?.messages?.length) continue;
          for (const msg of value.messages) {
            await processMessage(msg, value.contacts?.[0]);
          }
        }
      }
    } catch (err) {
      console.error('Webhook POST error:', err);
    }
    return;
  }

  res.status(405).end();
};
