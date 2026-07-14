"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { GlossaryTerm } from "@/types/question";

interface GlossaryPopoverProps {
  term: GlossaryTerm;
  children: ReactNode;
  /** Fires the first time this term is opened (once per mount / close-reopen cycle). */
  onOpen?: (term: GlossaryTerm) => void;
}

export function GlossaryPopover({ term, children, onOpen }: GlossaryPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) onOpen?.(term);
      return next;
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <span className="relative inline">
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="inline text-[var(--mastery-mastered)] font-medium underline decoration-[var(--assignment-completed-muted)] decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
      >
        {children}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/20 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-md rounded-2xl border p-5"
              style={{
                background: "var(--assignment-popover-bg)",
                borderColor: "var(--assignment-popover-border)",
                boxShadow: "var(--assignment-popover-shadow)",
                backdropFilter: "blur(14px) saturate(115%)",
                WebkitBackdropFilter: "blur(14px) saturate(115%)",
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <h4 className="text-lg font-semibold text-[var(--mastery-mastered)]">
                  {term.term}
                </h4>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Definition
                  </p>
                  <p className="text-sm text-slate-gray leading-relaxed">
                    {term.definition}
                  </p>
                </div>

                {term.example && (
                  <div className="pt-2 border-t border-border-subtle">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Example
                    </p>
                    <p className="text-sm text-slate-gray/80 italic leading-relaxed">
                      {term.example}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </span>
  );
}
