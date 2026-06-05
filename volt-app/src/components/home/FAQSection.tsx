"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "How much does transportation from Columbus GA to Atlanta Airport cost?",
    answer:
      "Adult seats are $59 each. Children (under 12) are $49. Pets are $25 and extra bags are $10 each. There are no hidden fees — what you see at booking is what you pay.",
  },
  {
    question: "Where does Volt pick up passengers in Columbus?",
    answer:
      "We have a designated pickup location in Columbus, GA. You'll receive the exact pickup address with instructions in your booking confirmation text message.",
  },
  {
    question: "Can I bring luggage?",
    answer:
      "Yes. Each passenger may bring one standard bag at no charge. Additional bags are $10 each. Our drivers provide full luggage assistance loading and unloading.",
  },
  {
    question: "Can I travel with a pet?",
    answer:
      "Yes — pets are welcome aboard Volt for $25 per pet. Pets must be in an appropriate carrier or crate for the duration of the trip.",
  },
  {
    question: "How early should I arrive for pickup?",
    answer:
      "We recommend arriving at the pickup location at least 10 minutes before your scheduled departure. The shuttle departs on schedule, so punctuality is important.",
  },
  {
    question: "How long does the trip take?",
    answer:
      "The trip from Columbus, GA to Atlanta Hartsfield-Jackson Airport takes approximately 2 to 2.5 hours depending on traffic conditions.",
  },
  {
    question: "What is the cancellation policy?",
    answer:
      "You can cancel or make changes to your booking up until 11:59 PM the day before your scheduled trip for a full refund. Cancellations after that time are non-refundable.",
  },
  {
    question: "Do I need to create an account to book?",
    answer:
      "No account is required. You can book as a guest and manage your reservation using your confirmation number and phone number.",
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8" id="faq">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-[#A1A1AA]">
            Everything you need to know about traveling with Volt.
          </p>
        </div>

        <div className="space-y-2">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="glass rounded-xl overflow-hidden transition-all"
            >
              <button
                type="button"
                onClick={() =>
                  setOpenIndex(openIndex === index ? null : index)
                }
                className="w-full flex items-center justify-between p-5 text-left"
                aria-expanded={openIndex === index}
              >
                <span className="text-white font-medium pr-4 text-sm sm:text-base">
                  {faq.question}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-[#7C3AED] flex-shrink-0 transition-transform duration-200 ${
                    openIndex === index ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openIndex === index && (
                <div className="px-5 pb-5">
                  <p className="text-[#A1A1AA] text-sm leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
