import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  accent?: boolean;
  href?: string;   // makes the whole card a link
}

export default function StatCard({ label, value, sub, icon: Icon, trend, accent, href }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent ? "bg-[#FCC300]/20" : "bg-white/6"}`}>
          <Icon className={`w-4.5 h-4.5 ${accent ? "text-[#FCC300]" : "text-[#A1A1AA]"}`} size={18} />
        </div>
        {href && !trend && (
          <ChevronRight className="w-4 h-4 text-[#A1A1AA] group-hover:text-[#FCC300] group-hover:translate-x-0.5 transition-all" />
        )}
        {trend && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            trend.positive
              ? "bg-green-500/15 text-green-400"
              : "bg-red-500/15 text-red-400"
          }`}>
            {trend.positive ? "+" : ""}{trend.value}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-0.5">{value}</div>
      <div className="text-[#A1A1AA] text-sm">{label}</div>
      {sub && <div className="text-[#A1A1AA] text-xs mt-1">{sub}</div>}
    </>
  );
  const className = `glass rounded-2xl p-5 ${accent ? "border-[#FCC300]/30" : ""}`;

  return href ? (
    <Link
      href={href}
      aria-label={`${label}: ${value}. View details`}
      className={`${className} group block transition-colors hover:border-[#FCC300]/50 hover:bg-white/[0.04] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FCC300]/60`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
