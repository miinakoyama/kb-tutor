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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border text-forest hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
        isCurrent
          ? "border-primary/60 bg-primary/15"
          : "border-primary/30"
      }`}
      aria-label={isCurrent ? `${label} reading. Stop.` : idleAriaLabel}
      aria-pressed={isCurrent}
    >
      {isCurrent ? (
        <Square className="w-3.5 h-3.5" />
      ) : (
        <Volume2 className="w-3.5 h-3.5" />
      )}
      {isCurrent ? "Stop" : label}
    </button>
  );
}
