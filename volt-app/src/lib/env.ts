// ─── Environment Validation ───────────────────────────────────────────────────
// Run this in server components or API routes to verify configuration.
// Logs helpful instructions when services aren't connected yet.
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceStatus {
  name: string;
  configured: boolean;
  instructions?: string;
}

export function checkEnvironment(): { ready: boolean; services: ServiceStatus[] } {
  const services: ServiceStatus[] = [
    {
      name: "Supabase",
      configured:
        !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
        !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") &&
        process.env.NEXT_PUBLIC_SUPABASE_URL.includes("supabase.co"),
      instructions:
        "1. Create account at supabase.com\n" +
        "2. Create a new project\n" +
        "3. Run SQL migrations in: supabase/migrations/ (001 → 002 → 003)\n" +
        "4. Copy Project URL and anon key to .env.local",
    },
    {
      name: "Stripe",
      configured:
        !!process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_SECRET_KEY.startsWith("sk_") &&
        !process.env.STRIPE_SECRET_KEY.includes("placeholder"),
      instructions:
        "1. Create account at stripe.com\n" +
        "2. Get API keys from: Developers → API Keys\n" +
        "3. Add to .env.local: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY and STRIPE_SECRET_KEY\n" +
        "4. Add webhook: Developers → Webhooks → https://yourdomain.com/api/payments/webhook\n" +
        "5. Copy webhook signing secret to .env.local: STRIPE_WEBHOOK_SECRET",
    },
    {
      name: "Twilio (SMS)",
      configured:
        !!process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_ACCOUNT_SID.startsWith("AC") &&
        !process.env.TWILIO_ACCOUNT_SID.includes("placeholder"),
      instructions:
        "1. Create account at twilio.com\n" +
        "2. Get a phone number\n" +
        "3. Copy Account SID, Auth Token, and phone number to .env.local\n" +
        "4. SMS confirmations and reminders will then send automatically",
    },
  ];

  const ready = services.every((s) => s.configured);

  if (!ready) {
    console.log("\n" + "═".repeat(60));
    console.log("⚡ VOLT TRANSPORTATION — SERVICE CONFIGURATION");
    console.log("═".repeat(60));
    services.forEach((s) => {
      const icon = s.configured ? "✅" : "⚠️ ";
      console.log(`\n${icon}  ${s.name}: ${s.configured ? "Connected" : "Not yet connected"}`);
      if (!s.configured && s.instructions) {
        s.instructions.split("\n").forEach((line) => console.log(`   ${line}`));
      }
    });
    console.log("\n" + "═".repeat(60) + "\n");
  }

  return { ready, services };
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.includes("placeholder")) {
    throw new Error(
      `Missing environment variable: ${key}\n` +
      `Copy .env.local.example to .env.local and fill in the real value.`
    );
  }
  return value;
}
