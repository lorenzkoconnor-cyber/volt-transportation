"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useAppSettings } from "@/context/SettingsContext";
import { faqItems } from "@/lib/site-copy";

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // Prices, hours, fee and contact details come from Dashboard → Settings.
  const faqs = faqItems(useAppSettings());

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
                  className={`w-5 h-5 text-[#FCC300] flex-shrink-0 transition-transform duration-200 ${
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
