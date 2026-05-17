const axios = require('axios');

const SYSTEM_PROMPT = `You are a helpful WhatsApp assistant for Vision Print, an Indian photo printing service based in India.
Services: 4x6 (₹15), 5x7 (₹25), 8x10 (₹60), A4 (₹80) photo prints.
Delivery: 2-3 business days. Payment: UPI, cards, net banking via Cashfree.
Be friendly, helpful, and concise (under 80 words). Plain text only — NO markdown, NO asterisks, NO bullet points.
If the user asks to place an order, tell them to type "Hi" to start the order flow.`;

async function getAIReply(userMessage, conversationStep = '') {
  const prompt = SYSTEM_PROMPT +
    (conversationStep ? `\nCurrent order step: ${conversationStep}` : '') +
    `\n\nUser message: ${userMessage}`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 150, temperature: 0.7 },
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  return res.data.candidates[0].content.parts[0].text;
}

module.exports = { getAIReply };