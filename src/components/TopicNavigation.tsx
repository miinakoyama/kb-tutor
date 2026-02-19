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

  return (
    <div className="space-y-4">
      <button
        onClick={() => setIsExpanded((e) => !e)}
        className="w-full flex items-center justify-between text-left group"
      >
        <h3 className="text-lg font-bold text-leaf">
          {label}
        </h3>
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="p-1 rounded-full bg-leaf/10 group-hover:bg-leaf/20 transition-colors"
        >
          <ChevronDown className="w-5 h-5 text-leaf" />
        </motion.span>
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
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-all">
      <h4 className="font-semibold text-slate-gray text-lg mb-4">{topic}</h4>
      <Link
        href={`/practice?module=${moduleId}&topic=${encodeURIComponent(topic)}`}
        className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-white text-sm font-semibold transition-colors shadow-sm bg-[#16a34a] hover:bg-[#15803d]"
      >
        <Play className="w-4 h-4" />
        Take Quiz
      </Link>
    </div>
  );
}
