"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import type { GlossaryTerm } from "@/types/question";

interface GlossaryPanelProps {
  terms: GlossaryTerm[];
  defaultOpen?: boolean;
  title?: string;
  /** Fires when an individual term accordion is expanded. Intended for analytics. */
  onTermOpen?: (term: GlossaryTerm) => void;
}

export function GlossaryPanel({
  terms,
  defaultOpen = false,
  title = "Definitions",
  onTermOpen,
}: GlossaryPanelProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(defaultOpen);

  if (terms.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)] overflow-hidden">
      <button
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--assignment-calendar-nav-bg)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[var(--mastery-mastered)]" />
          <span className="text-sm font-semibold text-slate-gray">{title}</span>
        </div>
        {isPanelOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {isPanelOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {terms.map((term) => (
                <TermAccordion key={term.id} term={term} onOpen={onTermOpen} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TermAccordion({
  term,
  onOpen,
}: {
  term: GlossaryTerm;
  onOpen?: (term: GlossaryTerm) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) onOpen?.(term);
      return next;
    });
  };

  return (
    <div className="border-b border-border-subtle last:border-b-0 pb-2 last:pb-0">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between py-1.5 text-left"
      >
        <span className="text-sm font-semibold text-slate-gray">{term.term}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <p className="text-sm text-slate-gray/80 leading-relaxed pb-1">
              {term.definition}
            </p>
            {term.example && (
              <p className="text-xs text-muted-foreground italic mt-1">
                Example: {term.example}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
