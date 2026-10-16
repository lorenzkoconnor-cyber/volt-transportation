# Volt Transportation — Service Connection Guide

Everything is built and working in demo mode. Follow these steps to connect real services and go live.

---

## Step 1 — Supabase (Database & Auth)

**Time: ~15 minutes**

1. Go to [supabase.com](https://supabase.com) → Create account → New Project
   - Name: `volt-transportation`
   - Region: `US East (N. Virginia)` — closest to Columbus, GA
   - Generate a strong database password (save it)

2. Once created, go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

3. Go to **SQL Editor** and run the migrations **in order**:
   - Paste and run: `supabase/migrations/001_initial_schema.sql`
   - Paste and run: `supabase/migrations/002_rls_policies.sql`
   - Paste and run: `supabase/migrations/003_seed_data.sql`

4. Create the owner account:
   - Go to **Authentication → Users → Add User**
   - Use your work email and a strong password
   - Copy the user UUID shown after creation
   - Go back to **SQL Editor** and run:
     ```sql
     insert into employees (user_id, role, first_name, last_name, email)
     values (
       'PASTE-YOUR-USER-UUID-HERE',
       'owner',
       'Your First Name',
       'Your Last Name',
       'your@email.com'
     );
     ```

5. Update `.env.local` with the values from Step 2.

6. Go to **Authentication → URL Configuration**:
   - Site URL: `https://volt-transportation.com`
   - Redirect URLs: add `https://volt-transportation.com/auth/callback`

**Result:** Login, booking, reservations, and all database features go live.

---

## Step 2 — Stripe (Payments)

**Time: ~20 minutes**

1. Go to [stripe.com](https://stripe.com) → Create account
   - Complete identity verification (required for payouts)
   - Add your bank account for payouts

2. Go to **Developers → API Keys** and copy:
   - `Publishable key` (starts with `pk_`) → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `Secret key` (starts with `sk_`) → `STRIPE_SECRET_KEY`

   > **Start with test keys** (`pk_test_...` / `sk_test_...`) until you're ready for live payments.

3. Set up the **Webhook**:
   - Go to **Developers → Webhooks → Add Endpoint**
   - URL: `https://volt-transportation.com/api/payments/webhook`
   - Events to listen for:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `charge.refunded`
   - Copy the **Signing Secret** → `STRIPE_WEBHOOK_SECRET`

4. For local testing, install the Stripe CLI:
   ```bash
   # Listen and forward to your local server
   stripe listen --forward-to localhost:3000/api/payments/webhook
   ```
   This gives you a local webhook secret for dev testing.

5. Upgrade Step4Checkout to use Stripe Elements:
   - Wrap your `/book` page with `<Elements stripe={stripePromise}>` from `@stripe/react-stripe-js`
   - Replace the placeholder inputs with `<PaymentElement />` for full PCI compliance
   - The `TODO` comments in `Step4Checkout.tsx` mark the exact spots

**Result:** Real card payments, refunds, and payment webhooks go live.

---

## Step 3 — RingCentral (Texts: confirmations, receipts, reminders)

Volt texts customers from its existing RingCentral office number. Replies go to
that number's inbox in the RingCentral app — they are never handled by the website.

**Needs someone with RingCentral admin access. ~20 minutes, plus carrier approval time.**

1. **Register the number for business texting (10DLC / TCR).** US carriers block
   automated texts from unregistered numbers. In the RingCentral Admin Portal open
   **Phone System → SMS Registration** (may be called "TCR registration"). If it isn't
   approved yet, submit the brand + campaign now — approval takes days to weeks.
   - Campaign type: *Customer care / account notifications*
   - Sample message: "Volt Transportation: Hi Sam! Your ride is confirmed. Confirmation: VOLT-ABC123 … Reply STOP to opt out."
   - Opt-in: customers give their phone number when booking online or with staff.
2. **Shared inbox:** to let several employees answer replies, assign the number that
   sends texts to a **Call Queue** with "Shared SMS" turned on (Admin Portal → Phone
   System → Groups → Call Queues). Otherwise replies go to one person's RingCentral app.
3. **Create the API app** at [developers.ringcentral.com](https://developers.ringcentral.com) → Console → Register App:
   - Type: **REST API App**, auth: **JWT auth flow**, server-side web app (no UI)
   - Permissions: **SMS** (add **Read Messages** too)
   - Once created, copy **Client ID** and **Client Secret**. Production access may
     need RingCentral's "Apply for production" step.
4. **Create a JWT credential** (Console → profile menu → Credentials → Create JWT),
   signed in as the user who owns the sending number. Copy it.
5. Add to the Hostinger environment variables (and `.env.local` for local testing):
   - `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET`, `RINGCENTRAL_JWT`
   - `RINGCENTRAL_FROM_NUMBER` — the Volt number in `+1XXXXXXXXXX` format
   Then redeploy.

Until these are set, texts are only logged (simulated) and reminders are skipped —
nothing breaks. Twilio still works as a fallback if its keys are set instead.

**Result:** confirmation text right after every booking (online and Team Portal), a
"Text me my confirmation" button on the confirmation page, Text Confirmation / Text
Receipt buttons on each reservation, a text after every edit, and reminders 24 hours
and 2 hours before each departure.

---

## Step 3b — Email through Hostinger (confirmations, receipts, alerts, Contact form)

No outside email service — the site logs into a Hostinger mailbox and sends from it.

1. Use the existing `support@contactvolt.com` mailbox (hPanel → **Emails** →
   `contactvolt.com`). You need its password; reset it there if nobody has it.
   Customer replies to Volt's emails then land in that same inbox.
2. Add to the Hostinger environment, then redeploy:
   `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`,
   `SMTP_USER=support@contactvolt.com`, `SMTP_PASS=<that password>`,
   `EMAIL_FROM="Volt Transportation <support@contactvolt.com>"`,
   `SUPPORT_EMAIL=support@contactvolt.com`.
3. Test: send a message from the Contact page — it should arrive at
   support@contactvolt.com, and replying goes straight to the customer.

Hostinger caps how many emails one mailbox can send per day (see your email
plan in hPanel); that's far above Volt's volume. Every text and email is listed
under **Dashboard → Messages → Outbox**, with failures retried automatically.

---

## Step 4 — Trip reminders, retries & staff alerts (already scheduled)

Supabase **pg_cron** calls `https://volt-transportation.com/api/cron/reminders`
every 10 minutes (migration `019_trip_reminder_cron`). It authenticates with a
secret stored in Supabase Vault as `cron_secret`. Each run queues due reminder
texts, retries failed texts/emails, and checks for staff alerts (card holds
about to expire, vans full, payments with no booking). Choose who gets each
alert under **Dashboard → Settings → Staff Alerts**.

- Add **`CRON_SECRET`** to the Hostinger environment with the same value as in
  `.env.local` (it's already in Vault), then redeploy.
- To rotate it: change both the Vault secret `cron_secret` and `CRON_SECRET`.

The old `send-reminder` Edge Function is no longer needed.

---

## Step 5 — Deploy to Hostinger

**Time: ~30 minutes**

1. Build the production app:
   ```bash
   cd volt-app
   npm run build
   ```

2. On Hostinger:
   - Create a **Node.js** hosting plan (required for Next.js)
   - Or use Hostinger's **VPS** and deploy with PM2

3. Set all environment variables in the Hostinger control panel:
   - Copy every variable from `.env.local` into Hostinger's environment settings
   - Never commit `.env.local` to GitHub

4. Connect your domain `volt-transportation.com`:
   - Point DNS to Hostinger nameservers
   - Enable SSL (Hostinger provides free Let's Encrypt SSL)

5. Update Supabase:
   - **Authentication → URL Configuration → Site URL** → `https://volt-transportation.com`

6. Switch Stripe to **live keys** when ready:
   - Replace `pk_test_...` with `pk_live_...`
   - Replace `sk_test_...` with `sk_live_...`
   - Create a new live webhook endpoint in Stripe Dashboard

---

## Environment Variables Checklist

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Where to get it | Required for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | Everything |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Everything |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | Server-side DB operations |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API Keys | Payments |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API Keys | Payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → Signing Secret | Payment confirmations |
| `RINGCENTRAL_CLIENT_ID` | RingCentral Developer Console → your app | SMS |
| `RINGCENTRAL_CLIENT_SECRET` | RingCentral Developer Console → your app | SMS |
| `RINGCENTRAL_JWT` | RingCentral Developer Console → Credentials | SMS |
| `RINGCENTRAL_FROM_NUMBER` | The Volt office number, `+1XXXXXXXXXX` | SMS |
| `CRON_SECRET` | Same value as Supabase Vault `cron_secret` | Reminders, retries, staff alerts |
| `SMTP_HOST` / `SMTP_PORT` | `smtp.hostinger.com` / `465` | Email |
| `SMTP_USER` / `SMTP_PASS` | The Hostinger mailbox you send from | Email |
| `EMAIL_FROM` | `Volt Transportation <that mailbox>` | Email |
| `SUPPORT_EMAIL` | `support@contactvolt.com` | Contact-page messages |
| `TWILIO_*` (optional) | Twilio Console | SMS fallback only |
| `NEXT_PUBLIC_APP_URL` | Your domain | SMS reminders, callbacks |
| `INTERNAL_API_SECRET` | Generate a random string | Internal API security |

---

## What Works Right Now (Demo Mode)

Even without any accounts connected:
- ✅ Full public website
- ✅ Complete booking flow (simulated payment)
- ✅ Manage Reservation UI
- ✅ Customer login/signup UI
- ✅ Employee login UI
- ✅ Full admin dashboard UI
- ✅ Dispatch and manifest views
- ✅ All 33 pages building clean

Connecting services upgrades each piece to fully live:
- **Supabase** → Real database, auth, reservations stored
- **Stripe** → Real card payments charged
- **Twilio** → Real SMS confirmations sent
