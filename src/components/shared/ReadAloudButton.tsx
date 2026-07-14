"use client";

import { Square, Volume2 } from "lucide-react";
import type { ReadSection } from "@/hooks/useTextToSpeech";

interface ReadAloudButtonProps {
  section: ReadSection;
  label: string;
  text: string;
  isSpeaking: boolean;
  currentSection: ReadSection | null;
  onToggle: (section: ReadSection, text: string) => void;
  /** Fires only when a play starts (not when stopping). Intended for analytics. */
  onPlay?: (section: ReadSection) => void;
  disabled?: boolean;
  iconOnly?: boolean;
}

function buildIdleAriaLabel(label: string): string {
  return /^read\b/i.test(label.trim()) ? label : `Read ${label}`;
}

export function ReadAloudButton({
  section,
  label,
  text,
  isSpeaking,
  currentSection,
  onToggle,
  onPlay,
  disabled = false,
  iconOnly = false,
}: ReadAloudButtonProps) {
  const isCurrent = isSpeaking && currentSection === section;
  const idleAriaLabel = buildIdleAriaLabel(label);

  const handleClick = () => {
    if (!isCurrent) onPlay?.(section);
    onToggle(section, text);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`inline-flex items-center transition-colors ${
        iconOnly
          ? "justify-center h-8 w-8 rounded-full p-0"
          : "gap-1.5 h-8 px-3 text-xs font-medium rounded-full"
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40 disabled:cursor-not-allowed ${
        isCurrent
          ? "bg-[var(--assignment-calendar-nav-bg-hover)] text-[var(--mastery-mastered)]"
          : "bg-[var(--assignment-calendar-nav-bg)] text-slate-gray hover:bg-[var(--assignment-calendar-nav-bg-hover)]"
      }`}
      style={{
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-nav-shadow)",
        backdropFilter: "blur(10px) saturate(130%)",
        WebkitBackdropFilter: "blur(10px) saturate(130%)",
      }}
      aria-label={isCurrent ? `${label} reading. Stop.` : idleAriaLabel}
      aria-pressed={isCurrent}
    >
      {isCurrent ? (
        <Square className="w-3.5 h-3.5" />
      ) : (
        <Volume2 className="w-3.5 h-3.5" />
      )}
      {!iconOnly ? (isCurrent ? "Stop" : label) : null}
    </button>
  );
}
