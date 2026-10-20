import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { isSquareConfigured, squareEnvironment } from "@/lib/square/server";
import { cancelTerminal, listTerminals, startTerminalCheckout, terminalStatus } from "@/lib/square/terminal";

// Square Terminal — staff take a walk-in card payment on the counter Terminal.
//
//   GET                                   → { devices, simulated, environment }
//   POST { action: "start",  paymentId, deviceId } → sends the itemized cart to the Terminal
//   POST { action: "status", paymentId }           → { status, paid } (the dashboard polls this)
//   POST { action: "cancel", paymentId }           → stops the checkout on the Terminal
//
// The amount and the cart come from the payments row + reservation, never the
// browser. Square's webhook (/api/payments/square-webhook) also marks the
// payment paid if the dashboard was closed mid-tap.

export async function GET() {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({
    devices: await listTerminals(ctx.sb),
    simulated: !isSquareConfigured(),
    environment: squareEnvironment(),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = await request.json();
    const paymentId = String(body?.paymentId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const result =
      body.action === "start" ? await startTerminalCheckout(ctx.sb, paymentId, String(body.deviceId ?? ""))
      : body.action === "status" ? await terminalStatus(ctx.sb, paymentId)
      : body.action === "cancel" ? await cancelTerminal(ctx.sb, paymentId)
      : { error: "Invalid request.", status: 400 };

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[square-terminal]", err);
    const message = err instanceof Error ? err.message : "Square Terminal request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
