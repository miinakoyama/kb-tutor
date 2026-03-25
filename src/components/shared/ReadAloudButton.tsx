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
  disabled = false,
}: ReadAloudButtonProps) {
  const isCurrent = isSpeaking && currentSection === section;
  const idleAriaLabel = buildIdleAriaLabel(label);

  return (
    <button
      type="button"
      onClick={() => onToggle(section, text)}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border text-[#166534] hover:bg-[#16a34a]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
        isCurrent
          ? "border-[#16a34a]/60 bg-[#16a34a]/15"
          : "border-[#16a34a]/30"
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
