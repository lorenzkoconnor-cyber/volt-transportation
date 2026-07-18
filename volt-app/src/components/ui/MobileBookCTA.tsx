"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function MobileBookCTA() {
  const [visible, setVisible] = useState(false);
  const [docked, setDocked] = useState<"bottom" | "top">("bottom");
  const [viewH, setViewH] = useState(0);

  useEffect(() => {
    const onResize = () => setViewH(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.65);
      const atPageBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 24;
      if (atPageBottom) {
        setDocked("top");
      } else {
        // Once docked at the top, stay there until the user scrolls back up
        // to the "Why Choose Volt Transportation" section.
        const whyVolt = document.getElementById("why-volt");
        if (whyVolt && whyVolt.getBoundingClientRect().top >= 0) {
          setDocked("bottom");
        }
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Anchored at top-0 and moved with a single animated transform: 80px sits
  // just below the fixed navbar; viewH - 76 sits 20px above the bottom edge
  // (button is 56px tall). Anchor swaps (top/bottom) can't animate, and
  // viewport units are computed from innerHeight because dvh/vh can disagree
  // with the visible viewport under emulation and mobile browser chrome.
  const translateY =
    docked === "top"
      ? "translateY(80px)"
      : visible
        ? `translateY(${viewH - 76}px)`
        : `translateY(${viewH + 24}px)`;

  return (
    <div
      className="fixed top-0 left-4 right-4 z-40 md:hidden"
      style={{
        transform: translateY,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition:
          "transform 700ms cubic-bezier(0.22, 1.2, 0.36, 1), opacity 500ms ease-out",
      }}
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
