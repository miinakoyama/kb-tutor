"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Play, FolderOpen, Folder } from "lucide-react";
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
    <div className="space-y-3">
      <button
        onClick={() => setIsExpanded((e) => !e)}
        className="w-full flex items-center justify-between text-left px-4 py-3 rounded-xl bg-[#16a34a]/10 hover:bg-[#16a34a]/15 transition-colors group"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <FolderOpen className="w-5 h-5 text-[#16a34a]" />
          ) : (
            <Folder className="w-5 h-5 text-[#16a34a]" />
          )}
          <h3 className="text-base font-bold text-[#166534]">
            {label}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#16a34a] font-medium">
            {topicCount} topics
          </span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="p-1 rounded-full bg-[#16a34a]/10 group-hover:bg-[#16a34a]/20 transition-colors"
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
            <div className="grid gap-4 sm:grid-cols-2 pt-1">
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
