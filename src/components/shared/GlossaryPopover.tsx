"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import type { GlossaryTerm } from "@/types/question";

interface GlossaryPopoverProps {
  term: GlossaryTerm;
  children: ReactNode;
}

export function GlossaryPopover({ term, children }: GlossaryPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
        onClick={() => setIsOpen(!isOpen)}
        className="inline text-[#16a34a] font-medium underline decoration-[#16a34a]/40 decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50 rounded"
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
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-md bg-white rounded-xl border border-[#16a34a]/30 shadow-xl p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <h4 className="text-lg font-semibold text-[#16a34a]">
                  {term.term}
                </h4>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-slate-gray/50 hover:text-slate-gray hover:bg-slate-gray/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/50 mb-1">
                    Definition
                  </p>
                  <p className="text-sm text-slate-gray leading-relaxed">
                    {term.definition}
                  </p>
                </div>

                {term.example && (
                  <div className="pt-2 border-t border-slate-gray/10">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/50 mb-1">
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
