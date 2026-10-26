"use client";

import Link from "next/link";
import Logo from "@/components/ui/Logo";
import { useAppSettings } from "@/context/SettingsContext";

const footerLinks = {
  Company: [
    { href: "/about", label: "About Volt" },
    { href: "/how-it-works", label: "How It Works" },
    { href: "/locations", label: "Locations" },
    { href: "/contact", label: "Contact" },
  ],
  Service: [
    { href: "/airport-shuttle-service", label: "Airport Shuttle Service" },
    { href: "/pricing", label: "Pricing" },
    { href: "/book", label: "Book a Ride" },
    { href: "/manage-reservation", label: "Manage Reservation" },
    { href: "/text-alerts", label: "Text Alerts" },
    { href: "/safety-rules", label: "Safety & Rules" },
    { href: "/military", label: "Military & Giving Back" },
    { href: "/fort-moore-graduation", label: "Fort Moore Graduation" },
  ],
  Legal: [
    { href: "/terms", label: "Terms & Conditions" },
    { href: "/privacy-policy", label: "Privacy Policy" },
  ],
};

export default function Footer() {
  const { business } = useAppSettings();
  return (
    <footer className="bg-[#0A0A0A] border-t border-white/8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex mb-4" aria-label="Volt Transportation home">
              <Logo className="h-12 w-auto" />
            </Link>
            <p className="text-[#A1A1AA] text-sm leading-relaxed max-w-56">
              Premium shuttle service between Columbus, GA and Atlanta
              Hartsfield-Jackson Airport.
            </p>
            <p className="text-[#A1A1AA] text-sm mt-4 leading-relaxed">
              {business.street}
              <br />
              {business.cityLine}
            </p>
            <p className="text-[#A1A1AA] text-sm mt-2">
              <a
                href={business.phoneHref}
                className="hover:text-white transition-colors"
              >
                {business.phone}
              </a>
            </p>
            <p className="text-[#A1A1AA] text-sm">
              <a
                href={`mailto:${business.email}`}
                className="hover:text-white transition-colors"
              >
                {business.email}
              </a>
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-white text-sm font-semibold mb-4 tracking-wide uppercase">
                {category}
              </h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[#A1A1AA] hover:text-white text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-white/8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[#A1A1AA] text-xs">
            © {new Date().getFullYear()} Volt Transportation. All rights reserved.
          </p>
          {/* Hidden employee login — discrete */}
          <Link
            href="/emp-login"
            className="text-[#3A3A3A] hover:text-[#A1A1AA] text-xs transition-colors"
          >
            emp login
          </Link>
        </div>
      </div>
    </footer>
  );
}
