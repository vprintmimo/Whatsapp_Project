// lib/firebase.js
// Firebase Admin SDK — Firestore + Storage

const admin = require('firebase-admin');

// Initialize once (Vercel may reuse function instances)
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
  );
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

const db     = admin.firestore();
const bucket = admin.storage().bucket();
const FieldValue = admin.firestore.FieldValue;

// ── Conversation state ────────────────────────────────────────────────────
async function getConversation(phone) {
  const doc = await db.collection('conversations').doc(phone).get();
  return doc.exists ? doc.data() : { step: 'GREET', phone };
}

async function setConversation(phone, data) {
  await db.collection('conversations').doc(phone).set(data, { merge: true });
}

async function resetConversation(phone, orderId) {
  await db.collection('conversations').doc(phone).set({
    step: 'UPLOAD',
    phone,
    orderId,
    size: null,
    qty: null,
    total: null,
    photoURL: null,
    photoPath: null,
  });
}

// ── Orders ────────────────────────────────────────────────────────────────
async function saveOrder(orderId, data) {
  await db.collection('orders').doc(orderId).set(
    { ...data, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function getOrderByConversation(orderId) {
  const snap = await db.collection('conversations')
    .where('orderId', '==', orderId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { phone: doc.id, ...doc.data() };
}

// ── Storage: Upload photo from buffer ─────────────────────────────────────
async function uploadPhoto(buffer, contentType, path) {
  const file = bucket.file(path);
  await file.save(buffer, { contentType, resumable: false });
  // Generate a signed URL valid for 7 days
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

module.exports = {
  db, bucket, FieldValue,
  getConversation, setConversation, resetConversation,
  saveOrder, getOrderByConversation,
  uploadPhoto,
};
