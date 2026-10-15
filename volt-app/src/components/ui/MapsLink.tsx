"use client";

import { useEffect, useState } from "react";

type MapsLinkProps = {
  address: string;
  mode?: "directions" | "search";
  className?: string;
  children: React.ReactNode;
};

// iPhone, iPad (iPadOS reports as Macintosh), and Mac
const isAppleDevice = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);

function mapsUrl(address: string, mode: "directions" | "search", apple: boolean) {
  const q = encodeURIComponent(address);
  if (apple) {
    return mode === "directions" ? `https://maps.apple.com/?daddr=${q}` : `https://maps.apple.com/?q=${q}`;
  }
  return mode === "directions"
    ? `https://www.google.com/maps/dir/?api=1&destination=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** Opens Apple Maps on Apple devices and Google Maps everywhere else. */
export default function MapsLink({ address, mode = "directions", className, children }: MapsLinkProps) {
  const [apple, setApple] = useState(false);

  useEffect(() => {
    setApple(isAppleDevice());
  }, []);

  return (
    <a href={mapsUrl(address, mode, apple)} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
