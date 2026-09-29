"use client";
import { useEffect, useRef } from "react";

// The pointer itself is the Volt arrow image set in globals.css; this adds the
// soft aura that drifts behind it.
export default function CursorEffect() {
  const auraRef = useRef<HTMLDivElement>(null);
  const mouse   = useRef({ x: -200, y: -200 });
  const auraPos = useRef({ x: -200, y: -200 });
  const raf     = useRef<number>(0);

  useEffect(() => {
    // Touch-only devices have no pointer to follow
    if (window.matchMedia("(hover: none)").matches) return;

    const aura = auraRef.current;
    if (!aura) return;

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      aura.style.opacity = "1";
    };

    const onLeave = () => { aura.style.opacity = "0"; };
    const onEnter = () => { aura.style.opacity = "1"; };

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);

    const animate = () => {
      auraPos.current.x = lerp(auraPos.current.x, mouse.current.x, 0.055);
      auraPos.current.y = lerp(auraPos.current.y, mouse.current.y, 0.055);

      aura.style.transform = `translate(${auraPos.current.x}px, ${auraPos.current.y}px) translate(-50%,-50%)`;

      raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none select-none">
      {/* Soft aura glow that drifts behind the cursor */}
      <div
        ref={auraRef}
        className="fixed top-0 left-0 rounded-full z-[9990]"
        style={{
          width: "420px",
          height: "420px",
          background: "radial-gradient(circle, rgba(252, 195, 0,0.06) 0%, transparent 68%)",
          opacity: 0,
          transition: "opacity 0.5s",
          willChange: "transform",
        }}
      />
    </div>
  );
}
