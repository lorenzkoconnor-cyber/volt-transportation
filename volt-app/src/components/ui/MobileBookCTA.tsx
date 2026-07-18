"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function MobileBookCTA() {
  const [visible, setVisible] = useState(false);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.65);
      setAtBottom(
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 24
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed left-4 right-4 z-40 md:hidden transition-all duration-500 ease-out ${
        atBottom ? "top-20" : "bottom-5"
      } ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-20 opacity-0 pointer-events-none"
      }`}
    >
      <Link href="/book" className="block">
        <div className="flex items-center justify-center gap-2 h-14 rounded-2xl font-bold text-white text-base bg-[#7C3AED] shadow-2xl shadow-[#7C3AED]/40 active:scale-[0.97] transition-transform">
          Book Your Ride
          <ArrowRight className="w-5 h-5" />
        </div>
      </Link>
    </div>
  );
}
