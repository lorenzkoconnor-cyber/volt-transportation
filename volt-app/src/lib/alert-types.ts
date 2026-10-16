// ─── Staff alert types (shared by the server and Dashboard → Settings) ────────
// Must match the CHECK constraint on staff_alert_subscriptions.alert_type
// (migration 020).

export const ALERT_TYPES = [
  {
    type: "short_notice_booking",
    label: "Short-notice bookings",
    description: "A booking whose first ride leaves within the short-notice window (set below).",
  },
  {
    type: "online_cancellation",
    label: "Online cancellations",
    description: "A rider cancelled on the website.",
  },
  {
    type: "hold_expiring",
    label: "Card holds about to expire",
    description: "A Military Discount card hold expires within 2 days and still needs Approve / Reject.",
  },
  {
    type: "payment_without_reservation",
    label: "Payment with no booking",
    description: "A card was charged but no reservation (or staff payment) was recorded for it.",
  },
  {
    type: "van_capacity",
    label: "Van full or over capacity",
    description: "An upcoming van is fully booked, or has more riders than seats.",
  },
  {
    type: "service_pause",
    label: "Service pause affected riders",
    description: "A blackout / service pause was added and booked riders were affected — who needs follow-up.",
  },
  {
    type: "message_failed",
    label: "Customer message failed",
    description: "A text or email to a customer still failed after every retry.",
  },
] as const;

export type AlertType = (typeof ALERT_TYPES)[number]["type"];
