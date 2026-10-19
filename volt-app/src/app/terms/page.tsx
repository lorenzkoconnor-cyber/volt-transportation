import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { getAppSettings } from "@/lib/settings-server";
import { dollars } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Terms & Conditions | Volt Transportation",
  description: "Volt Transportation terms and conditions — booking agreement, refund policy, liability limitations, no-show policy, and payment terms.",
  alternates: { canonical: "https://volt-transportation.com/terms" },
};

// §17 quotes the live Military Discount amount from Dashboard → Settings.
// §18 (id "sms") is linked from the checkout's text opt-in box.
const sectionsFor = (OFF: string, b: { phone: string; email: string }): { title: string; body: string; id?: string }[] => [
  {
    title: "1. Booking Agreement",
    body: `By completing a booking with Volt Transportation, you agree to these Terms & Conditions in full. A reservation is confirmed upon receipt of full payment via our secure checkout. Volt Transportation reserves the right to refuse service to anyone who violates our Safety & Rules policy.`,
  },
  {
    title: "2. Refund Policy",
    body: `Passengers who cancel their reservation by 11:59 PM Eastern Time the day before the scheduled departure are refunded the amount paid minus a $15 cancellation fee per reservation. Cancellations made after this deadline are non-refundable. Refunds are issued automatically to the original payment method and typically appear within 5–10 business days; cash payments are refunded in cash at our Columbus office. Online booking closes 2 hours before each departure; later bookings may be made by phone. In the event that Volt Transportation cancels a departure (due to severe weather, mechanical issues, or other circumstances), passengers will receive a full refund.`,
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
  {
    title: "11. Luggage Allowance",
    body: `Each passenger may bring two standard suitcases (each 50 lbs or less, with a total linear size — length + width + height — of 62 inches or less) and one personal item small enough to keep on your lap or between your feet without intruding on another passenger's space (such as a purse, laptop bag, or small backpack). Because our shuttles are shared, luggage space is shared as well. If you are traveling with more than the standard allowance, we recommend reserving an additional seat. If a bag exceeds 50 lbs, you may be asked to assist with loading it, space permitting, and Volt Transportation is not liable for injuries resulting from the loading, unloading, or handling of such luggage.`,
  },
  {
    title: "12. Prohibited Items",
    body: `For the safety of all passengers, the following may not be transported: oversized boxes or luggage exceeding the standard allowance and duffel bags over the allowance; corrosive substances (such as acids and alkalis); flammable or combustible liquids (such as gasoline or kerosene); compressed gases; biohazardous materials; explosives, including fireworks; other hazardous materials (poisons, radioactive materials, and the like); items with a noxious odor; and any illegal substances.`,
  },
  {
    title: "13. Service Animals",
    body: `Fully trained service dogs are welcome aboard our shuttles when they meet applicable requirements. A service animal is a dog individually trained to do work or perform tasks for a person with a disability. Service animals in training, emotional-support animals, and comfort animals are not service animals for this purpose and travel as pets, subject to our pet policy, fees, and availability.`,
  },
  {
    title: "14. Traveling Minors & Unaccompanied Minors",
    body: `For safety, children ages 5–14 must travel with a parent or guardian. Minors ages 15–17 may travel unaccompanied. Children under age 5 must always travel with an accompanying adult.`,
  },
  {
    title: "15. Child Safety Seats",
    body: `If you are traveling with a child under age 8 who is less than 57 inches tall, please bring your own car seat or booster seat. Volt Transportation does not provide child car seats or boosters and is unable to store child restraint seats at our offices.`,
  },
  {
    title: "16. Firearms & Ammunition",
    body: `Weapons and firearms may not be carried onto the shuttle or in carry-on items, except by federal or local law-enforcement officers where permitted by law. Unloaded firearms may be transported in checked luggage only, inside a locked, hard-sided case, and must be declared to a Volt Transportation representative at pickup. Ammunition may not be carried in any personal or carry-on bag.`,
  },
  {
    title: "17. Military Discount",
    body: `Active-duty and retired members of the U.S. Armed Forces are eligible for a flat ${OFF} discount on each booking after verifying eligibility with a valid military ID. The discount applies once per reservation regardless of the fare, the number of passengers, or whether the booking is one way or round trip, and never exceeds the fare. Former service members who did not retire and first responders are not eligible. Verification is reviewed by Volt Transportation staff; for bookings made while a verification is under review, your card is authorized (placed on hold) for the regular fare rather than charged. If eligibility is approved, the fare less the ${OFF} discount is charged and the remainder of the hold is released. If eligibility is denied or cannot be verified, the regular fare is charged; if eligibility is approved later, the ${OFF} discount is refunded to the original payment method. Volt Transportation may deny the discount if eligibility cannot be verified.`,
  },
  {
    id: "sms",
    title: "18. Text Message (SMS) Terms",
    body: `Program: Volt Transportation booking notifications. If you opt in — by checking the optional text-message box at checkout or on our Text Alerts page (volt-transportation.com/text-alerts), or by telling our staff yes when booking by phone or in person — Volt Transportation will text the mobile number you provide about your reservation: booking confirmations, trip reminders, pickup and schedule updates, changes, cancellations and receipts. We do not send marketing texts. Opting in is not a condition of purchase; you can book without it and still receive email confirmations. Message frequency varies by booking. Message and data rates may apply. To stop receiving texts, reply STOP to any message; you will receive one final message confirming you have been unsubscribed. Reply HELP for help, or contact us at ${b.email} or ${b.phone}. Carriers are not liable for delayed or undelivered messages. Your mobile information and text-message consent are never sold or shared with third parties for marketing; see our Privacy Policy.`,
  },
];

export default async function TermsPage() {
  const settings = await getAppSettings();
  const sections = sectionsFor(dollars(settings.military.amount), settings.business);
  return (
    <>
      <Navbar />
      <main className="pt-20">
        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="mb-10">
              <h1 className="text-4xl font-bold text-white mb-3">Terms & Conditions</h1>
              <p className="text-[#A1A1AA] text-sm">Effective Date: October 19, 2026</p>
            </div>

            <div className="glass rounded-2xl divide-y divide-white/8 overflow-hidden">
              {sections.map((section) => (
                <div key={section.title} id={section.id} className="p-6 sm:p-8 scroll-mt-24">
                  <h2 className="text-white font-semibold text-lg mb-3">{section.title}</h2>
                  <p className="text-[#A1A1AA] text-sm leading-relaxed">{section.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 glass rounded-xl p-5 text-center">
              <p className="text-[#A1A1AA] text-sm">
                Questions about these terms?{" "}
                <a href="/contact" className="text-[#FCC300] hover:text-[#FFD54A] transition-colors">
                  Contact us
                </a>{" "}
                or see our{" "}
                <a href="/privacy-policy" className="text-[#FCC300] hover:text-[#FFD54A] transition-colors">
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
