"use client";

// Signs staff out after 15 minutes without any activity. Two minutes before,
// a warning counts down; only "Keep Using" dismisses it (moving the mouse
// doesn't), so someone walking past an unattended screen can't keep it open by
// accident. Last activity is shared across tabs through localStorage, so
// working in one dashboard tab keeps the others signed in too.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Clock } from "lucide-react";
import { IDLE_SIGNOUT_FLAG, readIdleClock, writeIdleClock } from "@/lib/idle-clock";

const IDLE_LIMIT_MS = 15 * 60 * 1000;
const WARNING_MS = 2 * 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"] as const;

export default function IdleSignOut() {
  const { signOut } = useAuth();
  const router = useRouter();
  const lastActivity = useRef(0);
  const warningRef = useRef(false);
  const signingOut = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const markActive = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    writeIdleClock(now);
  }, []);

  const keepUsing = () => {
    markActive();
    warningRef.current = false;
    setSecondsLeft(null);
  };

  useEffect(() => {
    // A reload (phones often reload a tab they put to sleep) keeps the old
    // clock, so an idle session is still signed out; only a fresh start resets it.
    if (!readIdleClock()) markActive();
    else lastActivity.current = readIdleClock();

    let lastWrite = 0;
    const onActivity = () => {
      if (warningRef.current) return;      // only "Keep Using" counts once the warning is up
      const now = Date.now();
      lastActivity.current = now;
      if (now - lastWrite > 5000) {        // pointermove fires constantly — throttle storage writes
        lastWrite = now;
        writeIdleClock(now);
      }
    };

    const check = async () => {
      if (signingOut.current) return;
      const last = Math.max(lastActivity.current, readIdleClock());
      lastActivity.current = last;
      const idle = Date.now() - last;

      if (idle >= IDLE_LIMIT_MS) {
        signingOut.current = true;
        try { sessionStorage.setItem(IDLE_SIGNOUT_FLAG, "1"); } catch { /* ignore */ }
        await signOut();   // also clears the idle clock
        router.replace("/emp-login");
      } else if (idle >= IDLE_LIMIT_MS - WARNING_MS) {
        warningRef.current = true;
        setSecondsLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000));
      } else if (warningRef.current) {
        // "Keep Using" was pressed in another tab.
        warningRef.current = false;
        setSecondsLeft(null);
      }
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    // Phones pause timers while locked — check right away when the page comes back.
    document.addEventListener("visibilitychange", check);
    const timer = setInterval(check, 1000);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", check);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (secondsLeft === null) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" role="alertdialog" aria-modal="true" aria-labelledby="idle-title">
      <div className="glass w-full max-w-sm rounded-2xl p-6 text-center bg-[#0F0F0F]">
        <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-[#FCC300]/10 border border-[#FCC300]/20 flex items-center justify-center">
          <Clock className="w-6 h-6 text-[#FCC300]" />
        </div>
        <h2 id="idle-title" className="text-white font-bold text-lg">Still there?</h2>
        <p className="text-[#A1A1AA] text-sm mt-1">
          You&apos;ll be signed out in <span className="text-white font-semibold tabular-nums">{mins}:{secs}</span> because
          there hasn&apos;t been any activity.
        </p>
        <button
          onClick={keepUsing}
          autoFocus
          className="mt-5 w-full h-11 rounded-xl bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold transition-colors"
        >
          Keep Using
        </button>
      </div>
    </div>
  );
}
