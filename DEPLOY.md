# Vision Print — WhatsApp Bot Deployment Guide
# Meta Cloud API + Vercel + Firebase + Cashfree

## Overview
Your bot runs as a Vercel serverless app. Meta sends WhatsApp messages to your Vercel URL,
which processes them and replies via the WhatsApp Cloud API.

─────────────────────────────────────────────────────────────────
## STEP 1 — Set Up Meta WhatsApp Business
─────────────────────────────────────────────────────────────────

1. Go to https://developers.facebook.com and log in with a Facebook account.

2. Click "My Apps" → "Create App"
   - Type: Business
   - Name: Vision Print
   - Business Account: Create or select existing

3. In your app dashboard, find "WhatsApp" and click "Set Up".

4. Go to WhatsApp → API Setup. You'll see:
   - A test phone number (free, for sandbox)
   - A temporary access token (valid 24h for testing)

5. Note down:
   ✅ Phone Number ID  (under "From" dropdown — a long number like 123456789012345)
   ✅ Access Token      (the long eyJ... token)
   ✅ WhatsApp Business Account ID

6. For production: Go to WhatsApp → Phone Numbers → Add a real number.
   You'll need to verify it. Costs nothing beyond Meta's messaging fees.

7. For a permanent access token (required for production):
   - Go to Business Settings → System Users → Create System User (Admin role)
   - Add Assets → Apps → Your App → Full Control
   - Generate Token → Select your app → Permissions: whatsapp_business_messaging, whatsapp_business_management
   - Copy this token — it doesn't expire ✅

─────────────────────────────────────────────────────────────────
## STEP 2 — Get Firebase Service Account Key
─────────────────────────────────────────────────────────────────

1. Go to https://console.firebase.google.com → visionprinttt-1fb8a

2. Project Settings (gear icon) → Service Accounts tab

3. Click "Generate new private key" → Download JSON file
   ⚠️  Keep this file secret — never commit it to git!

4. Base64 encode the file (run in your terminal):
   
   On Mac/Linux:
     cat path/to/serviceAccountKey.json | base64 | tr -d '\n'
   
   On Windows (PowerShell):
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\serviceAccountKey.json"))

5. Copy the output — you'll paste it as FIREBASE_SERVICE_ACCOUNT in Vercel env vars.

6. In Firebase Console, also:
   - Storage → Rules → set to allow server reads/writes:
     rules_version = '2';
     service firebase.storage {
       match /b/{bucket}/o {
         match /{allPaths=**} {
           allow read, write: if request.auth != null;
         }
       }
     }
   - Firestore → Rules → allow server access (Admin SDK bypasses rules anyway)

─────────────────────────────────────────────────────────────────
## STEP 3 — Get Cashfree Live Keys
─────────────────────────────────────────────────────────────────

1. Log in to https://merchant.cashfree.com

2. For TEST: Developers → API Keys → Test Mode
   For PROD:  Developers → API Keys → Production Mode
   (You need to complete KYC + bank verification for Production)

3. Set up Webhook:
   - Go to Developers → Webhooks
   - Add URL: https://YOUR_VERCEL_URL/api/cashfree-webhook
   - Events: PAYMENT_SUCCESS_WEBHOOK, PAYMENT_FAILED_WEBHOOK
   - Copy the webhook secret key

─────────────────────────────────────────────────────────────────
## STEP 4 — Deploy to Vercel
─────────────────────────────────────────────────────────────────

1. Install Vercel CLI:
     npm install -g vercel

2. In the project folder, initialize git and push to GitHub:
     git init
     git add .
     git commit -m "Initial commit"
     # Create a repo on github.com then:
     git remote add origin https://github.com/IAM-NITIN-KUMAR/visionprint-whatsapp.git
     git push -u origin main

3. Deploy via Vercel CLI:
     vercel login
     vercel --prod

   Or connect via Vercel Dashboard:
   - Go to https://vercel.com/new
   - Import your GitHub repo
   - Framework: Other (leave default)
   - Click Deploy

4. Note your deployment URL:
     https://visionprint-whatsapp.vercel.app

─────────────────────────────────────────────────────────────────
## STEP 5 — Set Environment Variables in Vercel
─────────────────────────────────────────────────────────────────

Go to: https://vercel.com → Your Project → Settings → Environment Variables

Add each of these:

  WHATSAPP_TOKEN          = [your permanent access token from Step 1]
  WHATSAPP_PHONE_ID       = [your phone number ID from Step 1]
  WHATSAPP_VERIFY_TOKEN   = visionprint_secret_2026   (or any string you choose)
  CASHFREE_APP_ID         = [from Step 3]
  CASHFREE_SECRET_KEY     = [from Step 3]
  CASHFREE_ENV            = TEST   (change to PROD when ready)
  ANTHROPIC_API_KEY       = [from console.anthropic.com]
  FIREBASE_SERVICE_ACCOUNT= [base64 string from Step 2]
  FIREBASE_STORAGE_BUCKET = visionprinttt-1fb8a.firebasestorage.app
  VERCEL_URL              = https://visionprint-whatsapp.vercel.app

After adding all variables, click "Redeploy" to apply them.

─────────────────────────────────────────────────────────────────
## STEP 6 — Register Meta Webhook
─────────────────────────────────────────────────────────────────

1. In Meta Developers → Your App → WhatsApp → Configuration

2. Under "Webhook", click "Edit":
   - Callback URL:    https://YOUR_VERCEL_URL/api/webhook
   - Verify Token:    visionprint_secret_2026  (same as WHATSAPP_VERIFY_TOKEN)
   - Click "Verify and Save"

3. Subscribe to these webhook fields:
   ✅ messages

4. Click "Subscribe" — Meta will send a GET request to your webhook to verify it.
   You'll see a green checkmark if successful.

─────────────────────────────────────────────────────────────────
## STEP 7 — Test Your Bot
─────────────────────────────────────────────────────────────────

1. Send "Hi" to your WhatsApp test number from any phone.
2. You should receive: "Hello! Welcome to Vision Print..."
3. Follow the flow: verify phone → upload photo → pick size → pay

To view logs: Vercel Dashboard → Your Project → Deployments → Functions → Logs

─────────────────────────────────────────────────────────────────
## STEP 8 — Go Live (Production Checklist)
─────────────────────────────────────────────────────────────────

☐  Meta App Review — submit for "whatsapp_business_messaging" permission
☐  Add a real verified phone number in Meta WhatsApp
☐  Complete Cashfree KYC → switch CASHFREE_ENV to PROD
☐  Update Cashfree webhook URL in their dashboard
☐  Firebase Storage rules locked down properly
☐  Regenerate your Cashfree test keys (you shared them in chat)
☐  Generate permanent Meta access token via System User

─────────────────────────────────────────────────────────────────
## File Structure
─────────────────────────────────────────────────────────────────

visionprint-whatsapp/
├── api/
│   ├── webhook.js           ← Main WhatsApp webhook (GET=verify, POST=messages)
│   └── cashfree-webhook.js  ← Payment confirmation webhook
├── lib/
│   ├── whatsapp.js          ← Meta Cloud API helpers
│   ├── firebase.js          ← Firestore + Storage (Admin SDK)
│   ├── cashfree.js          ← Payment order creation
│   └── claude.js            ← AI fallback replies
├── .env.example             ← Copy to .env for local dev
├── vercel.json              ← Vercel config
├── package.json
└── DEPLOY.md                ← This file

─────────────────────────────────────────────────────────────────
## Bot Conversation Flow
─────────────────────────────────────────────────────────────────

Customer: "Hi"
Bot: Welcome! Enter your phone number.

Customer: 9876543210
Bot: OTP sent — 123456

Customer: 123456
Bot: ✅ Verified! Send your photo.

Customer: [sends image]
Bot: Photo saved! Pick a size.  [List: 4x6/5x7/8x10/A4]

Customer: [picks A4]
Bot: How many copies?  [Buttons: 1/2/5]

Customer: [picks 2]
Bot: Order summary — ₹160. Pay now?  [Buttons: Pay/Cancel]

Customer: Pay
Bot: Payment link → https://cashfree...

[Customer pays]

Cashfree → POST /api/cashfree-webhook
Bot: ✅ Payment confirmed! Order VP1234567890. 2–3 days delivery.

─────────────────────────────────────────────────────────────────
## Data stored in Firestore
─────────────────────────────────────────────────────────────────

conversations/{phoneNumber}   — conversation state (step, OTP, orderId, size, qty...)
orders/{orderId}              — order data (photo URL, size, qty, total, status, paidAt...)
