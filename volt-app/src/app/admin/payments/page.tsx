"use client";

import { useState } from "react";
import { DollarSign, CreditCard, Banknote, RotateCcw, Search, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import StatCard from "@/components/admin/StatCard";

const MOCK_PAYMENTS = [
  { id: "pay1", confirmation: "VOLT-AB1234", name: "Sarah Mitchell",  amount: 118, method: "stripe", status: "paid",     date: "Jul 18, 2026", refund: 0 },
  { id: "pay2", confirmation: "VOLT-CD5678", name: "James Lawson",    amount: 177, method: "stripe", status: "paid",     date: "Jul 18, 2026", refund: 0 },
  { id: "pay3", confirmation: "VOLT-EF9012", name: "Tanya Williams",  amount: 59,  method: "cash",   status: "paid",     date: "Jul 19, 2026", refund: 0 },
  { id: "pay4", confirmation: "VOLT-GH3456", name: "Robert King",     amount: 236, method: "stripe", status: "paid",     date: "Jul 20, 2026", refund: 0 },
  { id: "pay5", confirmation: "VOLT-IJ7890", name: "Diana Foster",    amount: 59,  method: "stripe", status: "paid",     date: "Jul 15, 2026", refund: 0 },
  { id: "pay6", confirmation: "VOLT-KL2345", name: "Marcus Thompson", amount: 118, method: "stripe", status: "refunded", date: "Jul 17, 2026", refund: 118 },
];

const METHOD_STYLES: Record<string, string> = {
  stripe:  "bg-blue-500/15 text-blue-400",
  cash:    "bg-green-500/15 text-green-400",
  comp:    "bg-[#A1A1AA]/15 text-[#A1A1AA]",
};
const STATUS_STYLES: Record<string, string> = {
  paid:     "bg-green-500/15 text-green-400",
  pending:  "bg-yellow-500/15 text-yellow-400",
  refunded: "bg-orange-500/15 text-orange-400",
  failed:   "bg-red-500/15 text-red-400",
};

export default function PaymentsPage() {
  const [query, setQuery] = useState("");
  const filtered = MOCK_PAYMENTS.filter(
    (p) => !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.confirmation.includes(query.toUpperCase())
  );

  const totalRevenue = MOCK_PAYMENTS.filter(p=>p.status==="paid").reduce((s,p)=>s+p.amount,0);
  const totalRefunds = MOCK_PAYMENTS.reduce((s,p)=>s+p.refund,0);
  const stripeTotal  = MOCK_PAYMENTS.filter(p=>p.method==="stripe"&&p.status==="paid").reduce((s,p)=>s+p.amount,0);
  const cashTotal    = MOCK_PAYMENTS.filter(p=>p.method==="cash"&&p.status==="paid").reduce((s,p)=>s+p.amount,0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Payments</h1>
        <p className="text-[#A1A1AA] text-sm mt-0.5">Transaction history and refund management</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue"  value={`$${totalRevenue}`}  icon={TrendingUp} accent trend={{ value: "8%", positive: true }} />
        <StatCard label="Stripe Payments" value={`$${stripeTotal}`}  icon={CreditCard} />
        <StatCard label="Cash Payments"   value={`$${cashTotal}`}    icon={Banknote} />
        <StatCard label="Refunds Issued"  value={`$${totalRefunds}`} icon={RotateCcw} />
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="text-white font-semibold">Transactions</h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A1A1AA]" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"
              className="pl-8 bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 h-9 rounded-lg text-sm focus:border-[#7C3AED]" />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/6 text-[#A1A1AA] text-xs font-medium uppercase tracking-wider">
          <div className="col-span-3">Passenger</div>
          <div className="col-span-2">Confirmation</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-2 text-center">Method</div>
          <div className="col-span-1 text-right">Amount</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        <div className="divide-y divide-white/5">
          {filtered.map((p) => (
            <div key={p.id} className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-white/3 transition-colors items-center">
              <div className="col-span-3 text-white text-sm">{p.name}</div>
              <div className="col-span-2 text-[#7C3AED] text-xs font-mono">{p.confirmation}</div>
              <div className="col-span-2 text-[#A1A1AA] text-xs">{p.date}</div>
              <div className="col-span-2 flex justify-center">
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${METHOD_STYLES[p.method]}`}>
                  {p.method === "stripe" ? <CreditCard className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                  {p.method}
                </span>
              </div>
              <div className="col-span-1 text-right text-white font-semibold text-sm">${p.amount}</div>
              <div className="col-span-1 flex justify-center">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[p.status]}`}>{p.status}</span>
              </div>
              <div className="col-span-1 flex justify-end">
                {p.status === "paid" && (
                  <button className="text-[#A1A1AA] hover:text-orange-400 text-xs transition-colors">Refund</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
