import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  accent?: boolean;
}

export default function StatCard({ label, value, sub, icon: Icon, trend, accent }: StatCardProps) {
  return (
    <div className={`glass rounded-2xl p-5 ${accent ? "border-[#7C3AED]/30" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent ? "bg-[#7C3AED]/20" : "bg-white/6"}`}>
          <Icon className={`w-4.5 h-4.5 ${accent ? "text-[#7C3AED]" : "text-[#A1A1AA]"}`} size={18} />
        </div>
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
    </div>
  );
}
