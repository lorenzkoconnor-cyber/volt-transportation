"use client";

import { useEffect, useState } from "react";
import { isAppleUserAgent, mapsUrl } from "@/lib/maps";

type MapsLinkProps = {
  address: string;
  mode?: "directions" | "search";
  className?: string;
  children: React.ReactNode;
};

/** Opens Apple Maps on Apple devices and Google Maps everywhere else. */
export default function MapsLink({ address, mode = "directions", className, children }: MapsLinkProps) {
  const [apple, setApple] = useState(false);

  useEffect(() => {
    setApple(isAppleUserAgent(navigator.userAgent));
  }, []);

  return (
    <a href={mapsUrl(address, mode, apple)} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
