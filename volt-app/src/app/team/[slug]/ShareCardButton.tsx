"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Opens the phone's share sheet (Messages, contacts, email…) with the card's
// link. Browsers without the Web Share API copy the link instead.
export default function ShareCardButton({ name, url }: { name: string; url: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const data = { title: `${name} · Volt Transportation`, text: `${name}'s contact card at Volt Transportation`, url };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch {
        /* closed the share sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <Button
      type="button"
      onClick={share}
      className="mt-4 w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold h-11 rounded-xl"
    >
      <Share2 className="w-4 h-4 mr-1" /> {copied ? "Link copied" : "Share this card"}
    </Button>
  );
}
