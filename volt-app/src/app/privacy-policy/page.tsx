import type { Metadata } from "next";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy | Volt Transportation",
  description: "Volt Transportation privacy policy — how we collect, use, and protect your personal information.",
  alternates: { canonical: "https://volttransportation.com/privacy-policy" },
};

const sections = [
  {
    title: "Information We Collect",
    body: `When you book a trip or create an account, we collect: your name, email address, phone number, and payment information (processed securely by Stripe). We also collect information about your trips, including routes, dates, and passenger counts. We may collect limited usage data about how you interact with our website to improve our service.`,
  },
  {
    title: "How We Use Your Information",
    body: `We use your information to process bookings and send booking confirmations, send trip reminders and updates via SMS, manage your account and reservations, respond to customer service requests, and improve our service and website. We do not use your information for advertising purposes or sell it to third parties.`,
  },
  {
    title: "Payment Information",
    body: `All payment processing is handled by Stripe, a PCI-compliant payment processor. Volt Transportation does not store your full credit card number, CVV, or other sensitive payment details on our servers. Stripe's privacy policy governs how your payment data is handled.`,
  },
  {
    title: "SMS Communications",
    body: `By providing your phone number at booking, you consent to receive SMS messages from Volt Transportation including booking confirmations and trip reminders. Standard messaging rates may apply. You may opt out of SMS communications at any time by replying STOP to any message.`,
  },
  {
    title: "Data Sharing",
    body: `We do not sell your personal information. We may share limited information with trusted third-party service providers who help us operate our business (such as Stripe for payments and Twilio for SMS). These providers are contractually prohibited from using your data for any other purpose.`,
  },
  {
    title: "Data Retention",
    body: `We retain your booking and account information for as long as necessary to provide our services and comply with legal obligations. You may request deletion of your account and associated data by contacting us at hello@volttransportation.com.`,
  },
  {
    title: "Your Rights",
    body: `You have the right to access, correct, or delete the personal information we hold about you. To exercise these rights, contact us at hello@volttransportation.com. We will respond to your request within 30 days.`,
  },
  {
    title: "Cookies",
    body: `Our website uses minimal cookies necessary for the site to function (such as session management). We do not use third-party tracking or advertising cookies.`,
  },
  {
    title: "Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated effective date. Continued use of our services after updates constitutes acceptance of the revised policy.`,
  },
  {
    title: "Contact",
    body: `If you have questions about this Privacy Policy, please contact us at hello@volttransportation.com or by phone at (123) 456-7890.`,
  },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <Navbar />
      <main className="pt-20">
        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="mb-10">
              <h1 className="text-4xl font-bold text-white mb-3">Privacy Policy</h1>
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
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
