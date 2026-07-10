"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";

export function InstructorNoteIndicator({ note }: { note: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <span
      ref={ref}
      className="relative inline-flex flex-shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        aria-label="Instructor note"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <span
          className="absolute left-full top-1/2 z-20 ml-2 block -translate-y-1/2 text-left"
          style={{
            width: "max-content",
            maxWidth: 280,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--assignment-popover-bg)",
            border: "1px solid var(--assignment-popover-border)",
            boxShadow: "var(--assignment-popover-shadow)",
            backdropFilter: "blur(14px) saturate(120%)",
            WebkitBackdropFilter: "blur(14px) saturate(120%)",
          }}
          role="tooltip"
        >
          <span
            className="block"
            style={{
              color: "var(--muted-foreground)",
              fontSize: 15,
              fontWeight: 500,
              letterSpacing: "0.08em",
              lineHeight: 1.4,
              textTransform: "uppercase",
              fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              marginBottom: 6,
            }}
          >
            INSTRUCTOR NOTE
          </span>
          <span
            className="block"
            style={{
              color: "var(--foreground)",
              fontSize: 15,
              fontWeight: 500,
              lineHeight: 1.4,
              fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              whiteSpace: "normal",
            }}
          >
            {note}
          </span>
          <span
            className="absolute right-full top-1/2 h-2 w-2 translate-x-1/2 -translate-y-1/2 rotate-45"
            style={{
              background: "var(--assignment-popover-bg)",
              borderLeft: "1px solid var(--assignment-popover-border)",
              borderBottom: "1px solid var(--assignment-popover-border)",
            }}
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  );
}
