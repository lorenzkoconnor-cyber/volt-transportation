"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/",           label: "Home" },
  { href: "/how-it-works", label: "Services" },
  { href: "/locations",  label: "Routes" },
  { href: "/about",      label: "About Us" },
  { href: "/contact",    label: "Contact" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-[#0A0A0A]/90 backdrop-blur-xl border-b border-white/6" : "bg-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-16 lg:h-20">

          {/* Logo — text-based like the image */}
          <Link href="/" className="flex flex-col leading-none group">
            <div className="flex items-center gap-0">
              {/* V with purple accent */}
              <span className="text-[#7C3AED] text-xl font-black tracking-widest">V</span>
              <span className="text-white text-xl font-black tracking-widest">OLT</span>
            </div>
            <span className="text-[#A1A1AA] text-[9px] font-semibold tracking-[0.25em] uppercase">
              Transportation
            </span>
          </Link>

          {/* Desktop nav — centered */}
          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[#C0C0C0] hover:text-white text-sm font-medium transition-colors relative group"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-[#7C3AED] group-hover:w-full transition-all duration-200" />
              </Link>
            ))}
          </div>

          {/* Desktop right CTAs */}
          <div className="hidden lg:flex items-center gap-4">
            <Link
              href="/login"
              className="flex items-center gap-1.5 text-[#C0C0C0] hover:text-white text-sm font-medium transition-colors"
            >
              <User className="w-4 h-4" />
              Log In / Sign Up
            </Link>
            <Link href="/book">
              <Button
                size="sm"
                className="bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-bold px-6 rounded-md tracking-wide"
              >
                Book Now
              </Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setOpen(!open)}
            className="lg:hidden w-9 h-9 flex items-center justify-center text-white"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden bg-[#0F0F0F] border-t border-white/8">
          <div className="px-6 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-3 text-[#C0C0C0] hover:text-white text-sm font-medium transition-colors rounded-lg hover:bg-white/5"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 pb-1 border-t border-white/8 mt-2 space-y-2">
              <Link href="/login" onClick={() => setOpen(false)}>
                <button className="w-full text-left px-3 py-3 text-[#C0C0C0] hover:text-white text-sm font-medium">
                  Log In / Sign Up
                </button>
              </Link>
              <Link href="/book" onClick={() => setOpen(false)}>
                <Button className="w-full bg-[#7C3AED] hover:bg-[#9D5FF5] text-white font-bold">
                  Book Now
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
