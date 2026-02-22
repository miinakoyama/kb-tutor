"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Play } from "lucide-react";
import { MODULES } from "@/types/question";

const MODULE_LABELS: Record<number, string> = {
  1: "Module A — Cells and Cell Processes",
  2: "Module B — Continuity and Unity of Life",
};

export function TopicNavigation() {
  return (
    <div className="space-y-6">
      {MODULES.map((mod) => (
        <TopicModule
          key={mod.id}
          module={mod}
          label={MODULE_LABELS[mod.id] ?? `Module ${mod.id}`}
        />
      ))}
    </div>
  );
}

function TopicModule({
  module: mod,
  label,
}: {
  module: (typeof MODULES)[number];
  label: string;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const topicCount = mod.topics.length;

  return (
    <div className="space-y-4">
      <button
        onClick={() => setIsExpanded((e) => !e)}
        className="w-full flex items-center justify-between text-left px-5 py-4 rounded-xl bg-[#16a34a]/10 hover:bg-[#16a34a]/15 focus-visible:bg-[#16a34a]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50 transition-colors"
      >
        <h3 className="text-base font-semibold text-slate-gray">
          {label}
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-gray/60">
            {topicCount} topics
          </span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-[#16a34a]" />
          </motion.span>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {mod.topics.map((topic) => (
                <TopicCard key={topic} topic={topic} moduleId={mod.id} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TopicCard({ topic, moduleId }: { topic: string; moduleId: number }) {
  return (
    <div className="rounded-xl border border-[#16a34a]/30 bg-white p-5 shadow-sm hover:shadow-md hover:border-[#16a34a]/50 focus-within:shadow-md focus-within:border-[#16a34a]/50 transition-all">
      <h4 className="font-medium text-slate-gray mb-4">{topic}</h4>
      <Link
        href={`/practice?module=${moduleId}&topic=${encodeURIComponent(topic)}`}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-colors bg-[#16a34a] hover:bg-[#15803d] focus-visible:bg-[#15803d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50 focus-visible:ring-offset-2"
      >
        <Play className="w-4 h-4" />
        Take Quiz
      </Link>
    </div>
  );
}
