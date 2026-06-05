import { type BookingSearch, calcPrice } from "@/lib/booking";

export default function PriceSummary({
  search,
  compact = false,
}: {
  search: BookingSearch;
  compact?: boolean;
}) {
  const { lines, total } = calcPrice(search);

  if (compact) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-[#A1A1AA] text-sm">Total</span>
        <span className="text-white font-bold text-lg">${total}</span>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-5">
      <h3 className="text-white font-semibold text-sm mb-3">Price Summary</h3>
      <div className="space-y-2 mb-3">
        {lines.map((line) => (
          <div key={line.label} className="flex items-center justify-between">
            <span className="text-[#A1A1AA] text-sm">{line.label}</span>
            <span className="text-white text-sm font-medium">${line.amount}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 pt-3 flex items-center justify-between">
        <span className="text-white font-bold">Total</span>
        <span className="text-white font-bold text-xl">${total}</span>
      </div>
      {search.roundTrip && (
        <p className="text-[#A1A1AA] text-xs mt-2">Includes both legs of your round trip</p>
      )}
    </div>
  );
}
