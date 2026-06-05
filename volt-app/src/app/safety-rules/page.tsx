import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Safety & Rules | Volt Transportation Passenger Policies",
  description:
    "Volt Transportation passenger conduct, luggage policy, pet policy, cancellation rules, and safety guidelines for your Columbus GA to ATL airport shuttle.",
  alternates: { canonical: "https://volttransportation.com/safety-rules" },
};

const sections = [
  {
    title: "Passenger Conduct",
    items: [
      "All passengers are expected to behave respectfully toward drivers and fellow travelers.",
      "No smoking, vaping, or consumption of alcohol inside any Volt vehicle.",
      "Excessive noise, disruptive behavior, or aggression toward the driver or other passengers will result in removal from the vehicle.",
      "Passengers are responsible for the behavior of their traveling party.",
    ],
  },
  {
    title: "Luggage Policy",
    items: [
      "Each passenger is permitted one standard bag at no additional charge.",
      "Additional bags are $10 each, added at time of booking or by contacting us.",
      "Oversized items (surfboards, large sporting equipment, etc.) must be disclosed at booking.",
      "Volt is not responsible for lost, stolen, or damaged personal items.",
      "Drivers will assist with loading and unloading luggage.",
    ],
  },
  {
    title: "Pet Policy",
    items: [
      "Pets are welcome aboard Volt vehicles for a $25 fee per pet.",
      "All pets must be in an appropriate carrier or crate for the entire duration of the trip.",
      "Service animals are always welcome at no additional charge.",
      "Please disclose pets at time of booking — unannounced pets may be refused.",
    ],
  },
  {
    title: "Child Passenger Policy",
    items: [
      "Children are welcome on all Volt routes.",
      "Child pricing ($49) applies to passengers ages 2–12.",
      "Lap infants (under 2) ride free when accompanied by a paying adult.",
      "Parents and guardians are responsible for their children's behavior during the trip.",
      "Volt does not provide car seats. Parents should bring an appropriate child safety seat if needed.",
    ],
  },
  {
    title: "Cancellation Policy",
    items: [
      "Passengers may cancel or modify their reservation up until 11:59 PM the day before the scheduled trip for a full refund.",
      "Cancellations made after 11:59 PM the day before departure are non-refundable.",
      "To cancel or modify, use the Manage Reservation page or contact us directly.",
      "No-shows forfeit their fare and are not eligible for a refund.",
    ],
  },
  {
    title: "Check-In Requirements",
    items: [
      "Passengers must arrive at the pickup location at least 10 minutes before the scheduled departure.",
      "The shuttle will depart on schedule. Volt cannot hold the vehicle for late arrivals.",
      "If you are running late, contact us immediately — we will do our best to accommodate you.",
      "Have your confirmation number ready at pickup.",
    ],
  },
  {
    title: "Driver Authority",
    items: [
      "The driver has final authority over the vehicle and all passengers.",
      "Drivers may refuse service to passengers who are intoxicated, disruptive, or present a safety risk.",
      "Drivers are not permitted to make unscheduled stops unless there is an emergency.",
      "Please direct all concerns to Volt management — not directly to drivers during transit.",
    ],
  },
  {
    title: "Weather Delays",
    items: [
      "Volt will make every effort to operate on schedule in adverse weather conditions.",
      "In cases of severe weather, Volt reserves the right to delay, reschedule, or cancel a departure.",
      "Affected passengers will be notified by SMS as soon as possible.",
      "Full refunds will be issued for any Volt-initiated cancellation.",
    ],
  },
  {
    title: "Prohibited Items",
    items: [
      "Firearms (unless stored unloaded and in a locked case, per applicable law)",
      "Illegal substances",
      "Flammable or hazardous materials",
      "Open containers of alcohol",
      "Items that emit excessive odor or pose a health risk to other passengers",
    ],
  },
];

export default function SafetyRulesPage() {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        {/* Hero */}
        <section className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#7C3AED]/8 blur-[100px] pointer-events-none" />
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-6">
              <Shield className="w-3.5 h-3.5 text-[#7C3AED]" />
              <span className="text-[#A1A1AA] text-xs font-medium">Passenger Safety</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-5">Safety & Rules</h1>
            <p className="text-[#A1A1AA] text-lg leading-relaxed">
              To ensure a safe, comfortable, and enjoyable experience for everyone on board, all Volt passengers are expected to follow these guidelines.
            </p>
          </div>
        </section>

        {/* Sections */}
        <section className="pb-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {sections.map((section) => (
              <div key={section.title} className="glass rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 p-6 border-b border-white/8">
                  <div className="w-8 h-8 rounded-lg bg-[#7C3AED]/15 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-[#7C3AED]" />
                  </div>
                  <h2 className="text-white font-bold text-lg">{section.title}</h2>
                </div>
                <ul className="divide-y divide-white/5">
                  {section.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 p-5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] flex-shrink-0 mt-2" />
                      <span className="text-[#A1A1AA] text-sm leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <p className="text-[#A1A1AA] text-sm text-center pt-4">
              Questions about our policies?{" "}
              <a href="/contact" className="text-[#7C3AED] hover:text-[#9D5FF5] transition-colors">Contact us</a>.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
