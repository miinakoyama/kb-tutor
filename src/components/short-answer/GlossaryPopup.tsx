"use client";

import { useEffect } from "react";

interface GlossaryPopupProps {
  term: string;
  definition: string;
  /** Bounding rect of the clicked term pill — the popup anchors directly under it. */
  anchorRect: { left: number; bottom: number; width: number };
  onDismiss: () => void;
}

const POPUP_WIDTH = 220;
const GAP = 8;

/** Small tooltip anchored directly under the clicked term pill; dismisses on the next click anywhere. */
export function GlossaryPopup({
  term,
  definition,
  anchorRect,
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

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 9999;
  // Left-align with the pill, but keep the popup fully on-screen.
  const left = Math.min(
    Math.max(8, anchorRect.left),
    viewportWidth - POPUP_WIDTH - 8,
  );
  const top = anchorRect.bottom + GAP;

  return (
    <div
      role="tooltip"
      className="fixed z-[60] rounded-xl border border-[color:var(--assignment-popover-border)] px-3 py-2 text-xs shadow-lg"
      style={{
        left,
        top,
        width: POPUP_WIDTH,
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
