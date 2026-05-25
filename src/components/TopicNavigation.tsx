"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Play } from "lucide-react";
import { MODULES, TOPIC_DATA } from "@/types/question";

const MODULE_LABELS: Record<number, string> = {
  1: "Module 1 — Molecules to Organisms",
  2: "Module 2 — Continuity and Unity of Life",
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
        className="w-full flex items-center justify-between text-left px-5 py-4 rounded-xl bg-primary/10 hover:bg-primary/15 focus-visible:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors"
      >
        <h3 className="text-xl font-bold font-heading text-heading">{label}</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {topicCount} topics
          </span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-primary" />
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
  const topicInfo = TOPIC_DATA[topic];

  return (
    <div className="rounded-3xl border border-primary/30 bg-surface p-5 shadow-sm hover:shadow-md hover:border-primary transition-all flex flex-col">
      <h4 className="text-xl font-bold font-heading text-heading mb-2">{topic}</h4>

      {topicInfo && (
        <>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            {topicInfo.description}
          </p>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {topicInfo.keywords.map((keyword) => (
              <span
                key={keyword}
                className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-gray/10 text-muted-foreground"
              >
                {keyword}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="mt-auto">
        <Link
          href={`/practice?module=${moduleId}&topic=${encodeURIComponent(topic)}`}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-white text-sm font-semibold transition-colors bg-primary hover:bg-primary-hover focus-visible:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
        >
          <Play className="w-4 h-4" />
          Start Practice
        </Link>
      </div>
    </div>
  );
}
