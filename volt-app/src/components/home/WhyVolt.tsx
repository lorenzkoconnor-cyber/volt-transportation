import { Shield, Users, Star, Zap } from "lucide-react";
import Image from "next/image";
import ScrollReveal from "@/components/ui/ScrollReveal";
import GoogleMapsButton from "@/components/ui/GoogleMapsButton";

const features = [
  {
    icon: Zap,
    title: "Luxury Vehicles",
    description:
      "Travel in style aboard our fleet of Ford Transit Passenger Vans — the premium choice for airport transportation.",
  },
  {
    icon: Shield,
    title: "Professional Drivers",
    description:
      "Our chauffeur-style drivers are background-checked, professionally trained, and focused on your safety.",
  },
  {
    icon: Users,
    title: "More Comfort",
    description:
      "We limit each vehicle to just 8 passengers, so you always have room to stretch out and relax.",
  },
  {
    icon: Star,
    title: "Premium Amenities",
    description:
      "Complimentary bottled water and full luggage assistance included.",
  },
];

export default function WhyVolt({ address }: { address: string }) {
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

        {/* Volt headquarters */}
        <ScrollReveal direction="up" className="mb-6">
          <div className="relative rounded-2xl overflow-hidden bg-[#171717] aspect-[16/9] sm:aspect-[21/9] glass">
            <Image
              src="/images/volt-storefront-wide.jpg"
              alt="Volt Transportation storefront in Columbus, Georgia"
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover brightness-[0.98] saturate-[0.96]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/50 via-[#0A0A0A]/15 to-[#0A0A0A]/10 pointer-events-none" />
          </div>
          <GoogleMapsButton address={address} className="mt-3" />
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* TODO: replace with the photo of William, Gary and Lorenzo in front of the vans */}
          <ScrollReveal direction="up">
            <div className="relative rounded-2xl overflow-hidden bg-[#171717] aspect-[4/3] glass">
              <Image
                src="/images/volt-team-vans.jpg"
                alt="Two Volt Transportation passenger vans"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover object-[center_40%]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/50 to-transparent pointer-events-none" />
            </div>
          </ScrollReveal>
          <ScrollReveal direction="up" delay={110}>
            <div className="relative rounded-2xl overflow-hidden bg-[#171717] aspect-[4/3] glass">
              <Image
                src="/images/van-interior-collage.jpg"
                alt="Inside a Volt Transportation van, showing rows of passenger seats"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/50 to-transparent pointer-events-none" />
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
