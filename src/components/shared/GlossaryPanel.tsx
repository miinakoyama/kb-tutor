"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import type { GlossaryTerm } from "@/types/question";

interface GlossaryPanelProps {
  terms: GlossaryTerm[];
  defaultOpen?: boolean;
  title?: string;
}

export function GlossaryPanel({
  terms,
  defaultOpen = false,
  title = "Definitions",
}: GlossaryPanelProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(defaultOpen);

  if (terms.length === 0) return null;

  return (
    <div className="rounded-xl border border-[#16a34a]/30 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setIsPanelOpen(!isPanelOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#16a34a]/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#16a34a]" />
          <span className="text-sm font-semibold text-slate-gray">{title}</span>
        </div>
        {isPanelOpen ? (
          <ChevronDown className="w-4 h-4 text-slate-gray/50" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-gray/50" />
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
                <TermAccordion key={term.id} term={term} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TermAccordion({ term }: { term: GlossaryTerm }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-slate-gray/10 last:border-b-0 pb-2 last:pb-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-1.5 text-left"
      >
        <span className="text-sm font-semibold text-slate-gray">{term.term}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <ChevronDown className="w-3.5 h-3.5 text-slate-gray/40" />
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
              <p className="text-xs text-slate-gray/60 italic mt-1">
                Example: {term.example}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
