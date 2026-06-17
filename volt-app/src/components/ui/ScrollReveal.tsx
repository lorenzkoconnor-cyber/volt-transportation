"use client";
import { useEffect, useRef, useState, ReactNode } from "react";

interface Props {
  children: ReactNode;
  delay?: number;
  direction?: "up" | "left" | "right" | "none";
  className?: string;
  threshold?: number;
}

export default function ScrollReveal({
  children,
  delay = 0,
  direction = "up",
  className = "",
  threshold = 0,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    const reveal = () => setVisible(true);

    // No IntersectionObserver support → show immediately (never hide content).
    if (typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }

    // If the element is already within (or above) the viewport when the effect
    // runs — common on mobile where hydration lags behind the user's scroll, or
    // on short pages — reveal right away instead of waiting for an intersection
    // that may never come.
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (el.getBoundingClientRect().top < vh) {
      const t = setTimeout(reveal, delay);
      return () => clearTimeout(t);
    }

    // threshold 0 + a small bottom margin means ANY part of the element entering
    // the viewport triggers the reveal. Using a percentage threshold can be
    // unreachable for sections taller than the screen (a frequent mobile bug).
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(reveal, delay);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(el);

    // Per-element safety net: content must never be left permanently hidden,
    // even if the observer never fires.
    const failsafe = setTimeout(reveal, 2000 + delay);

    return () => {
      observer.disconnect();
      clearTimeout(failsafe);
    };
  }, [delay, threshold, visible]);

  return (
    <div ref={ref} className={`sr-init sr-${direction} ${visible ? "sr-visible" : ""} ${className}`}>
      {children}
    </div>
  );
}
