"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Info } from "lucide-react";

interface InfoPopoverProps {
  /** Accessible label for the trigger (e.g. "How is accuracy computed?"). */
  label: string;
  /** Rich content displayed inside the popover. */
  children: ReactNode;
  /** Horizontal alignment of the popover relative to the trigger. */
  align?: "start" | "center" | "end";
  /** Visual style of the trigger. Default is a small info icon. */
  trigger?: ReactNode;
  /** Width hint for the popover panel. */
  width?: "narrow" | "wide";
}

/**
 * Compact, dependency-free popover used to surface short explanations on
 * hover or tap. Opens on click for keyboard / touch users, and on hover
 * for pointer users. Closes on outside click or Escape.
 */
export function InfoPopover({
  label,
  children,
  align = "center",
  trigger,
  width = "narrow",
}: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (event.target instanceof Node && wrapperRef.current.contains(event.target)) {
        return;
      }
      setOpen(false);
      setHovered(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setHovered(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = open || hovered;
  const alignClass =
    align === "start"
      ? "left-0"
      : align === "end"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";
  const widthClass = width === "wide" ? "w-80" : "w-64";

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={visible}
        aria-controls={panelId}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const nextOpen = !visible;
          setOpen(nextOpen);
          if (!nextOpen) setHovered(false);
        }}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-gray/50 transition-colors hover:text-[#16a34a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/40"
      >
        {trigger ?? <Info className="h-3.5 w-3.5" />}
      </button>
      {visible && (
        <span
          id={panelId}
          role="dialog"
          aria-label={label}
          className={`absolute top-full z-30 mt-2 ${alignClass} ${widthClass} rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-gray shadow-lg`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
