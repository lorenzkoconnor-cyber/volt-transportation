import Link from "next/link";
import { Zap } from "lucide-react";

const footerLinks = {
  Company: [
    { href: "/about", label: "About Volt" },
    { href: "/how-it-works", label: "How It Works" },
    { href: "/locations", label: "Locations" },
    { href: "/contact", label: "Contact" },
  ],
  Service: [
    { href: "/pricing", label: "Pricing" },
    { href: "/book", label: "Book a Ride" },
    { href: "/manage-reservation", label: "Manage Reservation" },
    { href: "/safety-rules", label: "Safety & Rules" },
  ],
  Legal: [
    { href: "/terms", label: "Terms & Conditions" },
    { href: "/privacy-policy", label: "Privacy Policy" },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-[#0A0A0A] border-t border-white/8 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#7C3AED] flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" fill="white" />
              </div>
              <span className="text-white font-semibold text-lg tracking-tight">
                Volt Transportation
              </span>
            </Link>
            <p className="text-[#A1A1AA] text-sm leading-relaxed max-w-56">
              Premium shuttle service between Columbus, GA and Atlanta
              Hartsfield-Jackson Airport.
            </p>
            <p className="text-[#A1A1AA] text-sm mt-4">
              <a
                href="tel:+11234567890"
                className="hover:text-white transition-colors"
              >
                (123) 456-7890
              </a>
            </p>
            <p className="text-[#A1A1AA] text-sm">
              <a
                href="mailto:hello@volttransportation.com"
                className="hover:text-white transition-colors"
              >
                hello@volttransportation.com
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
