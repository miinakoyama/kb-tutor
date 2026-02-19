"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb } from "lucide-react";
import type { HintLevels } from "@/types/question";

const LEVEL_LABELS: Record<keyof HintLevels, string> = {
  goal: "Goal",
  principle: "Principle",
  application: "Application",
  bottomOut: "Bottom-out",
};

const LEVEL_ORDER: (keyof HintLevels)[] = [
  "goal",
  "principle",
  "application",
  "bottomOut",
];

interface HintLadderProps {
  hints: HintLevels;
  onReveal?: (level: keyof HintLevels) => void;
}

export function HintLadder({ hints, onReveal }: HintLadderProps) {
  const [revealedCount, setRevealedCount] = useState(0);

  const handleReveal = () => {
    if (revealedCount >= LEVEL_ORDER.length) return;
    const nextLevel = LEVEL_ORDER[revealedCount];
    setRevealedCount((c) => c + 1);
    onReveal?.(nextLevel);
  };

  const canRevealMore = revealedCount < LEVEL_ORDER.length;

  return (
    <div className="mt-4 rounded-lg border border-leaf/30 bg-white/80 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {LEVEL_ORDER.slice(0, revealedCount).map((key, index) => (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="mb-2 last:mb-0"
              >
                <p className="text-xs font-medium text-leaf uppercase tracking-wide">
                  {LEVEL_LABELS[key]}
                </p>
                <p className="text-sm text-slate-gray">{hints[key]}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <button
          onClick={handleReveal}
          disabled={!canRevealMore}
          className={`flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-md text-sm font-medium transition-colors flex-shrink-0 ${
            canRevealMore
              ? "bg-leaf/20 text-slate-gray hover:bg-leaf/40"
              : "bg-slate-gray/10 text-slate-gray/60 cursor-not-allowed"
          }`}
        >
          <Lightbulb className="w-4 h-4" />
          {canRevealMore ? `Hint ${revealedCount + 1}` : "All hints revealed"}
        </button>
      </div>
    </div>
  );
}
