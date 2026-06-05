import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const pricing = [
  { label: "Adult Passenger", price: 59, per: "per seat" },
  { label: "Child Passenger", price: 49, note: "Under 12", per: "per seat" },
  { label: "Pet", price: 25, per: "per pet" },
  { label: "Extra Bag", price: 10, per: "per bag" },
];

const included = [
  "Complimentary bottled water",
  "USB charging at every seat",
  "Luggage assistance",
  "Professional chauffeur",
  "Real-time trip updates",
];

export default function PricingSection() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-[#0A0A0A]" id="pricing">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Pricing
          </h2>
          <p className="text-[#A1A1AA] text-lg">
            Transparent pricing. No hidden fees.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Pricing table */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-white/8">
              <h3 className="text-white font-semibold text-lg">Fare Breakdown</h3>
              <p className="text-[#A1A1AA] text-sm mt-1">Columbus ⇄ ATL Airport</p>
            </div>
            <div className="divide-y divide-white/8">
              {pricing.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between p-5"
                >
                  <div>
                    <div className="text-white font-medium">{item.label}</div>
                    {item.note && (
                      <div className="text-[#A1A1AA] text-xs mt-0.5">
                        {item.note}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-white text-2xl font-bold">
                      ${item.price}
                    </span>
                    <span className="text-[#A1A1AA] text-xs ml-1">
                      {item.per}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 bg-[#7C3AED]/5 border-t border-[#7C3AED]/20">
              <p className="text-[#7C3AED] text-sm font-medium">
                Military discount available — applied by our team upon request.
              </p>
            </div>
          </div>

          {/* What's included */}
          <div className="flex flex-col gap-6">
            <div className="glass rounded-2xl p-6">
              <h3 className="text-white font-semibold text-lg mb-5">
                Every Seat Includes
              </h3>
              <ul className="space-y-3">
                {included.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#7C3AED]/15 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-[#7C3AED]" />
                    </div>
                    <span className="text-[#A1A1AA] text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-2">
                Round Trip Savings
              </h3>
              <p className="text-[#A1A1AA] text-sm mb-4">
                Book your return trip at the same time. Price is calculated
                automatically at checkout.
              </p>
              <Link href="/book">
                <Button className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold">
                  Book Your Ride
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
