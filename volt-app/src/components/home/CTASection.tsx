import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import ScrollReveal from "@/components/ui/ScrollReveal";

export default function CTASection() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center">
        <ScrollReveal direction="up">
          <div className="relative">
            {/* Glow */}
            <div className="absolute inset-0 bg-[#7C3AED]/10 rounded-3xl blur-3xl" />
            <div className="relative glass rounded-3xl px-8 py-16 sm:py-20">
              <h2 className="text-3xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
                Ready to ride in comfort?
              </h2>
              <p className="text-[#A1A1AA] text-lg mb-10 max-w-xl mx-auto">
                Book your Columbus to Atlanta Airport shuttle in under 2 minutes.
                No account required.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/book">
                  <Button
                    size="lg"
                    className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-semibold px-10 py-6 text-base rounded-xl purple-glow group"
                  >
                    Book Your Ride
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/15 text-white hover:bg-white/5 font-semibold px-10 py-6 text-base rounded-xl"
                  >
                    Contact Us
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
