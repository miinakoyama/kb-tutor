"use client";

import { useEffect } from "react";

interface GlossaryPopupProps {
  term: string;
  definition: string;
  x: number;
  y: number;
  onDismiss: () => void;
}

/** Small dark tooltip near the cursor; dismisses on the next click anywhere. */
export function GlossaryPopup({
  term,
  definition,
  x,
  y,
  onDismiss,
}: GlossaryPopupProps) {
  useEffect(() => {
    const onClick = () => onDismiss();
    // Defer so the click that opened the popup does not immediately close it.
    const id = window.setTimeout(() => {
      document.addEventListener("click", onClick, { once: true });
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("click", onClick);
    };
  }, [onDismiss]);

  const clampedX = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 240);

  return (
    <div
      role="tooltip"
      className="fixed z-[60] max-w-[220px] rounded-xl border border-[color:var(--assignment-popover-border)] px-3 py-2 text-xs shadow-lg"
      style={{
        left: Math.max(8, clampedX),
        top: y + 12,
        background: "var(--assignment-popover-bg)",
        boxShadow: "var(--assignment-popover-shadow)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <span className="font-semibold text-[color:var(--foreground)]">{term}</span>
      <p className="mt-0.5 text-[color:var(--foreground)]/75">{definition}</p>
    </div>
  );
}
