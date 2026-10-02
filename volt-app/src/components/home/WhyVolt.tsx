import { Shield, Users, Star, Zap } from "lucide-react";
import ScrollReveal from "@/components/ui/ScrollReveal";

const features = [
  {
    icon: Zap,
    title: "Luxury Vehicles",
    description:
      "Travel in style aboard our fleet of Ford Transit Passenger Vans — the premium choice for airport transportation.",
  },
  {
    icon: Users,
    title: "More Comfort",
    description:
      "We limit each vehicle to just 8 passengers, so you always have room to stretch out and relax.",
  },
  {
    icon: Shield,
    title: "Professional Drivers",
    description:
      "Our chauffeur-style drivers are background-checked, professionally trained, and focused on your safety.",
  },
  {
    icon: Star,
    title: "Premium Amenities",
    description:
      "Complimentary bottled water and full luggage assistance included.",
  },
];

export default function WhyVolt() {
  return (
    <section id="why-volt" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal direction="up" className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Why Choose Volt Transportation
          </h2>
          <p className="text-[#A1A1AA] text-lg max-w-2xl mx-auto">
            We built Volt because Columbus deserved a better way to get to Atlanta Airport.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <ScrollReveal key={feature.title} delay={i * 110} direction="up" className="h-full">
                <div className="glass rounded-2xl p-6 hover:border-[#FCC300]/30 transition-all group h-full">
                  <div className="w-10 h-10 rounded-xl bg-[#FCC300]/15 flex items-center justify-center mb-5 group-hover:bg-[#FCC300]/25 transition-colors">
                    <Icon className="w-5 h-5 text-[#FCC300]" />
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-[#A1A1AA] text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
