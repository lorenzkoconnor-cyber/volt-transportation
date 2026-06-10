"use client";
import { useEffect, useRef } from "react";

export default function CursorEffect() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);
  const mouse   = useRef({ x: -200, y: -200 });
  const ringPos = useRef({ x: -200, y: -200 });
  const auraPos = useRef({ x: -200, y: -200 });
  const raf     = useRef<number>(0);

  useEffect(() => {
    // Touch-only devices keep the default cursor
    if (window.matchMedia("(hover: none)").matches) return;

    const dot  = dotRef.current;
    const ring = ringRef.current;
    const aura = auraRef.current;
    if (!dot || !ring || !aura) return;

    // Inject a global style to suppress the system cursor
    const styleEl = document.createElement("style");
    styleEl.id = "volt-cursor-override";
    styleEl.textContent = "*, *::before, *::after { cursor: none !important; }";
    document.head.appendChild(styleEl);

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const setOpacity = (v: string) => {
      dot.style.opacity  = v;
      ring.style.opacity = v;
      aura.style.opacity = v;
    };

    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      setOpacity("1");
      dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    };

    const onLeave = () => setOpacity("0");
    const onEnter = () => setOpacity("1");

    const onOver = (e: MouseEvent) => {
      const isInteractive = !!(e.target as HTMLElement).closest(
        "a, button, [role='button'], input, select, textarea, label, [tabindex]"
      );
      if (isInteractive) {
        ring.style.width  = "48px";
        ring.style.height = "48px";
        ring.style.background = "rgba(124,58,237,0.12)";
        ring.style.borderColor = "rgba(157,95,245,0.9)";
        dot.style.opacity = "0";
      } else {
        ring.style.width  = "24px";
        ring.style.height = "24px";
        ring.style.background = "transparent";
        ring.style.borderColor = "rgba(124,58,237,0.7)";
        dot.style.opacity = "1";
      }
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    document.addEventListener("mouseover", onOver);

    const animate = () => {
      ringPos.current.x = lerp(ringPos.current.x, mouse.current.x, 0.14);
      ringPos.current.y = lerp(ringPos.current.y, mouse.current.y, 0.14);
      auraPos.current.x = lerp(auraPos.current.x, mouse.current.x, 0.055);
      auraPos.current.y = lerp(auraPos.current.y, mouse.current.y, 0.055);

      ring.style.transform = `translate(${ringPos.current.x}px, ${ringPos.current.y}px) translate(-50%,-50%)`;
      aura.style.transform = `translate(${auraPos.current.x}px, ${auraPos.current.y}px) translate(-50%,-50%)`;

      raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);

    return () => {
      document.getElementById("volt-cursor-override")?.remove();
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      document.removeEventListener("mouseover", onOver);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none select-none">
      {/* Exact-position dot */}
      <div
        ref={dotRef}
        className="fixed top-0 left-0 w-2 h-2 rounded-full bg-[#7C3AED] z-[9999]"
        style={{ opacity: 0, transition: "opacity 0.25s", willChange: "transform" }}
      />
      {/* Lagging ring */}
      <div
        ref={ringRef}
        className="fixed top-0 left-0 rounded-full border z-[9998]"
        style={{
          width: "24px",
          height: "24px",
          opacity: 0,
          borderColor: "rgba(124,58,237,0.7)",
          transition: "opacity 0.25s, width 0.22s ease, height 0.22s ease, background 0.22s, border-color 0.22s",
          willChange: "transform",
        }}
      />
      {/* Soft aura glow that drifts behind the cursor */}
      <div
        ref={auraRef}
        className="fixed top-0 left-0 rounded-full z-[9990]"
        style={{
          width: "420px",
          height: "420px",
          background: "radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 68%)",
          opacity: 0,
          transition: "opacity 0.5s",
          willChange: "transform",
        }}
      />
    </div>
  );
}
