import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Terms & Conditions | Volt Transportation",
  description: "Volt Transportation terms and conditions — booking agreement, refund policy, liability limitations, no-show policy, and payment terms.",
  alternates: { canonical: "https://volttransportation.com/terms" },
};

const sections = [
  {
    title: "1. Booking Agreement",
    body: `By completing a booking with Volt Transportation, you agree to these Terms & Conditions in full. A reservation is confirmed upon receipt of full payment via our secure checkout. Volt Transportation reserves the right to refuse service to anyone who violates our Safety & Rules policy.`,
  },
  {
    title: "2. Refund Policy",
    body: `Passengers are entitled to a full refund if they cancel their reservation by 11:59 PM the day before the scheduled departure. Cancellations made after this deadline are non-refundable. Refunds are processed to the original payment method within 5–10 business days. In the event that Volt Transportation cancels a departure (due to severe weather, mechanical issues, or other circumstances), passengers will receive a full refund.`,
  },
  {
    title: "3. No-Show Policy",
    body: `A passenger is considered a no-show if they fail to appear at the designated pickup location by the scheduled departure time without prior notice. No-shows forfeit their fare and are not eligible for a refund or credit. If you believe you will be late, contact Volt Transportation immediately — we will do our best to accommodate you.`,
  },
  {
    title: "4. Reservation Changes",
    body: `Passengers may modify their reservation (date, time, passenger count, or add-ons) at no charge if changes are requested by 11:59 PM the day before the scheduled trip. Changes requested after this deadline are subject to availability and may not be possible. To modify a reservation, use the Manage Reservation feature on our website or contact us directly.`,
  },
  {
    title: "5. Payment Terms",
    body: `All fares are charged in USD at the time of booking. Payment is processed securely through Stripe. Volt Transportation does not store your full card details. For corporate or group accounts with net payment arrangements, separate billing terms apply — contact us to establish an account. In-person cash payment may be available for specific arrangements — contact us in advance.`,
  },
  {
    title: "6. Liability Limitations",
    body: `Volt Transportation is not liable for delays caused by traffic, weather, road conditions, or other circumstances beyond our control. Volt Transportation is not responsible for missed flights, connections, or any consequential damages resulting from a late or delayed trip. Passengers are responsible for their own travel planning, including allowing sufficient time for security, check-in, and boarding. Volt Transportation's liability is limited to the fare paid for the affected trip.`,
  },
  {
    title: "7. Luggage & Personal Property",
    body: `Volt Transportation is not responsible for lost, stolen, or damaged luggage or personal property. Passengers are encouraged to secure their valuables. Drivers will assist with loading and unloading, but are not liable for damage incurred during transport.`,
  },
  {
    title: "8. Passenger Conduct",
    body: `Passengers are expected to comply with Volt Transportation's Safety & Rules policy at all times. Volt Transportation reserves the right to remove any passenger who poses a safety risk, is disruptive, or violates our conduct policies. Removed passengers forfeit their fare and are not eligible for a refund.`,
  },
  {
    title: "9. Privacy",
    body: `Volt Transportation collects and uses customer information in accordance with our Privacy Policy. We do not sell your personal information to third parties. Payment information is handled by Stripe and never stored directly on Volt Transportation servers.`,
  },
  {
    title: "10. Changes to These Terms",
    body: `Volt Transportation reserves the right to update these Terms & Conditions at any time. Changes will be posted on this page with an updated effective date. Continued use of our services after changes constitutes acceptance of the updated terms.`,
  },
];

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="mb-10">
              <h1 className="text-4xl font-bold text-white mb-3">Terms & Conditions</h1>
              <p className="text-[#A1A1AA] text-sm">Effective Date: January 1, 2025</p>
            </div>

            <div className="glass rounded-2xl divide-y divide-white/8 overflow-hidden">
              {sections.map((section) => (
                <div key={section.title} className="p-6 sm:p-8">
                  <h2 className="text-white font-semibold text-lg mb-3">{section.title}</h2>
                  <p className="text-[#A1A1AA] text-sm leading-relaxed">{section.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 glass rounded-xl p-5 text-center">
              <p className="text-[#A1A1AA] text-sm">
                Questions about these terms?{" "}
                <a href="/contact" className="text-[#7C3AED] hover:text-[#9D5FF5] transition-colors">
                  Contact us
                </a>{" "}
                or see our{" "}
                <a href="/privacy-policy" className="text-[#7C3AED] hover:text-[#9D5FF5] transition-colors">
                  Privacy Policy
                </a>.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
