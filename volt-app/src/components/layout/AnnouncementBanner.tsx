"use client";

// The website banner set under Dashboard → Settings → Website Banner. Shown at
// the top of every public page while it's live; a rider can dismiss it for the
// rest of their visit.

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Megaphone, X } from "lucide-react";
import { useAppSettings } from "@/context/SettingsContext";

const storageKey = (id: string) => `volt-banner-dismissed-${id}`;

function wasDismissed(id: string): boolean {
  try {
    return sessionStorage.getItem(storageKey(id)) === "1";
  } catch {
    return false;
  }
}

const noSubscribe = () => () => {};

export default function AnnouncementBanner() {
  const { announcement } = useAppSettings();
  const [hidden, setHidden] = useState<string | null>(null);
  // Read after hydration only (the server can't see sessionStorage).
  const dismissedEarlier = useSyncExternalStore(
    noSubscribe,
    () => (announcement ? wasDismissed(announcement.id) : false),
    () => false,
  );
  if (!announcement || hidden === announcement.id || dismissedEarlier) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(storageKey(announcement.id), "1"); } catch { /* private mode */ }
    setHidden(announcement.id);
  };
  const external = announcement.linkUrl && /^https?:\/\//.test(announcement.linkUrl);

  return (
    <div className="bg-[#FCC300] text-[#0A0A0A]" role="status">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-2 flex items-center gap-3 text-sm">
        <Megaphone className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-0 font-medium">
          {announcement.message}
          {announcement.linkUrl && (
            <>
              {" "}
              {external ? (
                <a href={announcement.linkUrl} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                  {announcement.linkLabel || "Learn more"}
                </a>
              ) : (
                <Link href={announcement.linkUrl} className="underline font-semibold">
                  {announcement.linkLabel || "Learn more"}
                </Link>
              )}
            </>
          )}
        </p>
        <button onClick={dismiss} aria-label="Dismiss announcement" className="p-1 rounded hover:bg-black/10 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
