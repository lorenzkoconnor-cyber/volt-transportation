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
   - Site URL: `https://volttransportation.com`
   - Redirect URLs: add `https://volttransportation.com/auth/callback`

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
   - URL: `https://volttransportation.com/api/payments/webhook`
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

## Step 3 — Twilio (SMS Notifications)

**Time: ~10 minutes**

1. Go to [twilio.com](https://twilio.com) → Create account
   - Verify your phone number
   - Complete the account setup wizard

2. Go to **Console → Account Info** and copy:
   - `Account SID` → `TWILIO_ACCOUNT_SID`
   - `Auth Token` → `TWILIO_AUTH_TOKEN`

3. Get a phone number:
   - Go to **Phone Numbers → Buy a Number**
   - Choose a Georgia area code (706 or 762) or any US number
   - Make sure it has **SMS capability**
   - Copy the number → `TWILIO_PHONE_NUMBER` (format: `+17065550100`)

4. Update `.env.local` with all three values.

**Result:** Booking confirmations and day-before reminders send automatically via SMS.

---

## Step 4 — Supabase Edge Function for Reminders

**Time: ~5 minutes** (after Twilio is set up)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project (get the ref from your Supabase project URL)
supabase link --project-ref YOUR_PROJECT_REF

# Set the secrets (Edge Function environment variables)
supabase secrets set NEXT_PUBLIC_APP_URL=https://volttransportation.com
supabase secrets set INTERNAL_API_SECRET=your-random-secret-string

# Deploy the reminder function
supabase functions deploy send-reminder

# Schedule it to run daily at 6pm
supabase functions schedule send-reminder --cron "0 18 * * *"
```

**Result:** Passengers automatically receive a reminder SMS the evening before their trip.

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

4. Connect your domain `volttransportation.com`:
   - Point DNS to Hostinger nameservers
   - Enable SSL (Hostinger provides free Let's Encrypt SSL)

5. Update Supabase:
   - **Authentication → URL Configuration → Site URL** → `https://volttransportation.com`

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
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info | SMS |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Account Info | SMS |
| `TWILIO_PHONE_NUMBER` | Twilio Console → Phone Numbers | SMS |
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
