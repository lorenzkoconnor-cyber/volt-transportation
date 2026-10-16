import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadReceipt } from "@/lib/receipt";
import { formatCents, formatDateLong, formatDateShort, formatTime12h } from "@/lib/format";
import ReceiptActions from "./ReceiptActions";
import { getAppSettings } from "@/lib/settings-server";

// Customer receipt — printed at the counter or opened from a texted link.
// The link carries the reservation's unguessable receipt token, so it isn't
// indexed and shows nothing without it.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Receipt",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No show",
};

function issued(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default async function ReceiptPage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { token } = await params;
  const { print } = await searchParams;
  const [r, settings] = await Promise.all([loadReceipt(token), getAppSettings()]);
  const { business } = settings;
  if (!r) notFound();

  return (
    <main className="receipt-page min-h-screen bg-[#0A0A0A] py-6 sm:py-10 px-4">
      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body { background: #fff !important; }
          .receipt-page { background: #fff !important; padding: 0 !important; }
          .receipt-paper { box-shadow: none !important; border: none !important; max-width: none !important; padding: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <ReceiptActions autoPrint={print === "1"} />

      <article className="receipt-paper mx-auto max-w-[640px] bg-white text-[#111] rounded-2xl shadow-xl p-6 sm:p-10">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 border-b-4 border-[#FCC300] pb-5">
          <div>
            <div className="text-2xl font-extrabold tracking-tight">Volt Transportation</div>
            <div className="text-sm text-[#555] mt-1 leading-snug">
              {business.street} · {business.cityLine}<br />
              {business.phone} · volt-transportation.com
            </div>
          </div>
          <div className="sm:text-right sm:flex-shrink-0">
            <div className="text-xs uppercase tracking-widest text-[#777]">Receipt</div>
            <div className="text-xs text-[#777] mt-1">Issued {issued(new Date().toISOString())}</div>
          </div>
        </header>

        {/* Confirmation */}
        <section className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#777]">Confirmation number</div>
            <div className="text-3xl font-bold font-mono tracking-wider mt-1">{r.confirmationNumber}</div>
          </div>
          <div className="text-right">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${
              r.status === "cancelled" ? "border-red-600 text-red-700" : "border-[#111] text-[#111]"
            }`}>
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
            <div className="text-xs text-[#777] mt-1">Booked {issued(r.bookedAt)}</div>
          </div>
        </section>

        {/* Customer */}
        <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <Row label="Customer" value={r.customer.name} />
          <Row label="Phone" value={r.customer.phone} />
          {r.customer.email && <Row label="Email" value={r.customer.email} />}
        </section>

        {/* Trips */}
        <section className="mt-6 space-y-3">
          {r.legs.map((leg) => (
            <div key={leg.label} className="rounded-xl border border-[#ddd] p-4">
              <div className="text-xs uppercase tracking-widest text-[#777]">{leg.label}</div>
              <div className="font-semibold mt-1">{leg.from} → {leg.to}</div>
              <div className="text-sm mt-0.5">
                {formatDateLong(leg.date)} · departs {formatTime12h(leg.time)}
              </div>
              {leg.flight && (
                <div className="text-sm text-[#555] mt-1">
                  Flight: {leg.flight.airline} {leg.flight.number} · {leg.flight.departing ? "departs" : "lands"}{" "}
                  {formatDateShort(leg.flight.date)} {formatTime12h(leg.flight.time)} · {leg.flight.terminal}
                </div>
              )}
            </div>
          ))}
          <p className="text-xs text-[#555]">Please arrive {settings.arriveEarlyMinutes} minutes before departure.</p>
        </section>

        {/* Passengers */}
        {r.passengers.length > 0 && (
          <section className="mt-6">
            <div className="text-xs uppercase tracking-widest text-[#777] mb-1">Passengers</div>
            <ol className="text-sm list-decimal list-inside space-y-0.5">
              {r.passengers.map((p, i) => <li key={i}>{p}</li>)}
            </ol>
          </section>
        )}

        {/* Charges */}
        <section className="mt-6">
          <div className="text-xs uppercase tracking-widest text-[#777] mb-2">Charges</div>
          <table className="w-full text-sm">
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.label}><td className="py-1">{l.label}</td><td className="py-1 text-right">{formatCents(l.cents)}</td></tr>
              ))}
              <tr className="border-t border-[#ddd]"><td className="py-1 text-[#555]">Subtotal</td><td className="py-1 text-right">{formatCents(r.subtotalCents)}</td></tr>
              {r.discount && (
                <tr><td className="py-1">{r.discount.label}</td><td className="py-1 text-right">−{formatCents(r.discount.cents)}</td></tr>
              )}
              <tr className="border-t-2 border-[#111] font-bold text-base">
                <td className="pt-2">Total</td><td className="pt-2 text-right">{formatCents(r.totalCents)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Payments */}
        <section className="mt-6">
          <div className="text-xs uppercase tracking-widest text-[#777] mb-2">Payments</div>
          {r.payments.length === 0 ? (
            <p className="text-sm text-[#555]">No payment recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {r.payments.map((p, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-1">
                      {p.label}
                      <div className="text-xs text-[#777]">{issued(p.date)}</div>
                    </td>
                    <td className="py-1 text-right">
                      {formatCents(p.cents)}
                      {p.refundedCents > 0 && <div className="text-xs">Refunded −{formatCents(p.refundedCents)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <table className="w-full text-sm mt-2">
            <tbody>
              <tr className="border-t border-[#ddd] font-semibold">
                <td className="pt-2">Amount paid</td><td className="pt-2 text-right">{formatCents(r.paidCents)}</td>
              </tr>
              {r.balanceDueCents > 0 && (
                <tr className="font-semibold"><td className="py-1">Balance due</td><td className="py-1 text-right">{formatCents(r.balanceDueCents)}</td></tr>
              )}
              {r.refundDueCents > 0 && (
                <tr><td className="py-1">Refund due to you</td><td className="py-1 text-right">{formatCents(r.refundDueCents)}</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <footer className="mt-8 pt-4 border-t border-[#ddd] text-xs text-[#777] leading-relaxed">
          Thank you for riding with Volt. To make changes, call or text {business.phone}.
          Terms &amp; Conditions: volt-transportation.com/terms
        </footer>
      </article>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-[#777] w-20 flex-shrink-0">{label}</span>
      <span className="font-medium break-all">{value || "—"}</span>
    </div>
  );
}
