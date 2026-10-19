import type { Metadata } from "next";
import { getAppSettings } from "@/lib/settings-server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy | Volt Transportation",
  description: "Volt Transportation privacy policy — how we collect, use, and protect your personal information.",
  alternates: { canonical: "https://volt-transportation.com/privacy-policy" },
};

const sectionsFor = (b: { phone: string; email: string }) => [
  {
    title: "Information We Collect",
    body: `When you book a trip or create an account, we collect: your name, email address, phone number, and payment information (processed securely by Stripe). We also collect information about your trips, including routes, dates, and passenger counts. We may collect limited usage data about how you interact with our website to improve our service.`,
  },
  {
    title: "How We Use Your Information",
    body: `We use your information to process bookings and send booking confirmations, send trip reminders and updates by text message (only if you opt in), manage your account and reservations, respond to customer service requests, and improve our service and website. We do not use your information for advertising purposes or sell it to third parties.`,
  },
  {
    title: "Payment Information",
    body: `All payment processing is handled by Stripe, a PCI-compliant payment processor. Volt Transportation does not store your full credit card number, CVV, or other sensitive payment details on our servers. Stripe's privacy policy governs how your payment data is handled.`,
  },
  {
    title: "SMS / Text Messages",
    body: `Volt Transportation only texts you if you opt in by checking the optional text-message box when you book online, or by telling our staff yes when booking by phone or in person. Texting is never required to book. If you opt in, we send messages about your reservation only: booking confirmations, trip reminders, pickup and schedule updates, changes and cancellations. Message frequency varies by booking. Message and data rates may apply. Reply STOP to any message to opt out, or HELP for help; you can also contact us at ${b.email} or ${b.phone}. We do not send marketing texts.`,
  },
  {
    title: "Mobile Information Is Not Shared",
    body: `No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with any third parties, except the text-messaging provider that delivers our messages on our behalf (RingCentral). All other categories of information described in this policy exclude text messaging originator opt-in data and consent.`,
  },
  {
    title: "Email Communications",
    body: `If you provide an email address, Volt Transportation emails you about your reservations: booking confirmations, changes, cancellations and receipts. These are transactional messages about trips you booked, not marketing. Messages you send through our Contact page are delivered to our support team and kept so we can respond.`,
  },
  {
    title: "Data Sharing",
    body: `We do not sell your personal information. We may share limited information with trusted third-party service providers who help us operate our business (such as Stripe for payments, RingCentral for text messages, and Hostinger for email). These providers are contractually prohibited from using your data for any other purpose. Phone numbers and text-message consent are never shared for marketing — see "Mobile Information Is Not Shared" above.`,
  },
  {
    title: "Data Retention",
    body: `We retain your booking and account information for as long as necessary to provide our services and comply with legal obligations. You may request deletion of your account and associated data by contacting us at ${b.email}.`,
  },
  {
    title: "Your Rights",
    body: `You have the right to access, correct, or delete the personal information we hold about you. To exercise these rights, contact us at ${b.email}. We will respond to your request within 30 days.`,
  },
  {
    title: "Cookies",
    body: `Our website uses cookies necessary for the site to function (such as session management). We also use Google Analytics, which sets cookies to help us understand how visitors find and use our website (for example, which pages are viewed and whether a booking was completed). Google Analytics does not receive your name, email, phone number, payment details or flight information. You can opt out with the Google Analytics Opt-out Browser Add-on (tools.google.com/dlpage/gaoptout) or by blocking cookies in your browser. Google's use of this data is described at policies.google.com/technologies/partner-sites.`,
  },
  {
    title: "Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated effective date. Continued use of our services after updates constitutes acceptance of the revised policy.`,
  },
  {
    title: "Contact",
    body: `If you have questions about this Privacy Policy, please contact us at ${b.email} or by phone at ${b.phone}.`,
  },
];

export default async function PrivacyPolicyPage() {
  const sections = sectionsFor((await getAppSettings()).business);
  return (
    <>
      <Navbar />
      <main className="pt-20">
        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="mb-10">
              <h1 className="text-4xl font-bold text-white mb-3">Privacy Policy</h1>
              <p className="text-[#A1A1AA] text-sm">Effective Date: October 19, 2026</p>
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
