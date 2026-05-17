// api/cashfree-webhook.js
// Cashfree notifies this endpoint when payment succeeds or fails

const cf = require('../lib/cashfree');
const fb = require('../lib/firebase');
const wa = require('../lib/whatsapp');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // ── Verify Cashfree webhook signature ──────────────────────────────────
  const signature = req.headers['x-webhook-signature'];
  const timestamp = req.headers['x-webhook-timestamp'];

  if (signature && timestamp) {
    const rawBody = JSON.stringify(req.body);
    const valid = cf.verifySignature(rawBody, timestamp, signature);
    if (!valid) {
      console.warn('❌ Cashfree webhook: invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  // Acknowledge immediately
  res.status(200).json({ status: 'ok' });

  try {
    const { data, type } = req.body;
    console.log(`[Cashfree] event=${type} order=${data?.order?.order_id} status=${data?.payment?.payment_status}`);

    const orderId       = data?.order?.order_id;
    const paymentStatus = data?.payment?.payment_status; // SUCCESS | FAILED | PENDING

    if (!orderId) return;

    // ── Payment SUCCESS ─────────────────────────────────────────────────
    if (paymentStatus === 'SUCCESS') {
      await fb.saveOrder(orderId, {
        status: 'paid',
        paymentId: data?.payment?.cf_payment_id,
        paymentMode: data?.payment?.payment_group,
        paidAt: new Date().toISOString(),
      });

      // Find which user's conversation has this orderId
      const conv = await fb.getOrderByConversation(orderId);
      if (conv) {
        const { phone, size, qty, total } = conv;
        await fb.setConversation(phone, { step: 'DONE' });
        await wa.sendText(phone,
          `✅ Payment Confirmed! 🎉\n\n` +
          `🔖 Order ID: ${orderId}\n` +
          `🖼️  Size: ${size}\n` +
          `📦  Copies: ${qty}\n` +
          `💰  Paid: ₹${total}\n\n` +
          `📦 Your prints will be ready in 2–3 business days!\n\n` +
          `Thank you for choosing Vision Print 🖨️❤️\n\n` +
          `Type "new order" anytime to order again.`
        );
      }
    }

    // ── Payment FAILED ──────────────────────────────────────────────────
    if (paymentStatus === 'FAILED') {
      await fb.saveOrder(orderId, { status: 'payment_failed' });
      const conv = await fb.getOrderByConversation(orderId);
      if (conv) {
        const { phone, total } = conv;
        await fb.setConversation(phone, { step: 'CONFIRM' });
        await wa.sendButtons(phone,
          `❌ Payment of ₹${total} failed.\n\nWould you like to try again?`,
          [{ id: 'pay_yes', title: '🔄 Retry Payment' }, { id: 'pay_no', title: '❌ Cancel Order' }]
        );
      }
    }

  } catch (err) {
    console.error('Cashfree webhook error:', err);
  }
};
