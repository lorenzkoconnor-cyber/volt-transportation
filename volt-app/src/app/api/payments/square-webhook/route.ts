import { NextRequest, NextResponse } from "next/server";
import { createAdminDb } from "@/lib/checkout";
import { verifySquareSignature } from "@/lib/square/server";
import { onCheckoutUpdated } from "@/lib/square/terminal";

// POST /api/payments/square-webhook — Square → Volt.
// Square Developer Dashboard → your app → Webhooks → Subscriptions:
//   URL:    https://volt-transportation.com/api/payments/square-webhook
//   Events: terminal.checkout.updated, refund.updated
// The subscription's signature key goes in SQUARE_WEBHOOK_SIGNATURE_KEY.
//
// terminal.checkout.updated is the backup that marks a Terminal payment paid
// when the dashboard was closed before the tap finished.

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifySquareSignature(raw, request.headers.get("x-square-hmacsha256-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "terminal.checkout.updated":
        await onCheckoutUpdated(createAdminDb(), event.data?.object?.checkout);
        break;
      case "refund.updated": {
        // Volt records refunds when staff issue them; just flag ones Square couldn't complete.
        const refund = event.data?.object?.refund as { id?: string; status?: string; payment_id?: string } | undefined;
        if (refund?.status === "FAILED" || refund?.status === "REJECTED") {
          console.error(`[square-webhook] refund ${refund.id} for payment ${refund.payment_id} ${refund.status}`);
        }
        break;
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[square-webhook]", err);
    // 500 → Square retries the notification.
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
