// lib/claude.js
// Claude AI — fallback intelligent replies

const axios = require('axios');

const SYSTEM_PROMPT = `You are a helpful WhatsApp assistant for Vision Print, an Indian photo printing service based in India.
Services: 4x6 (₹15), 5x7 (₹25), 8x10 (₹60), A4 (₹80) photo prints.
Delivery: 2-3 business days. Payment: UPI, cards, net banking via Cashfree.
Be friendly, helpful, and concise (under 80 words). Plain text only — NO markdown, NO asterisks, NO bullet points.
If the user asks to place an order, tell them to type "Hi" to start the order flow.`;

async function getAIReply(userMessage, conversationStep = '') {
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      system: SYSTEM_PROMPT + (conversationStep ? `\nCurrent order step: ${conversationStep}` : ''),
      messages: [{ role: 'user', content: userMessage }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    }
  );
  return res.data.content[0].text;
}

module.exports = { getAIReply };
