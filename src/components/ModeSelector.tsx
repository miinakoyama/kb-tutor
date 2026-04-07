"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sparkles,
  ClipboardCheck,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PracticeMode } from "@/types/question";

interface ModeSelectorProps {
  moduleId?: number;
  topicName: string;
}

interface ModeCardData {
  mode: PracticeMode;
  title: string;
  subtitle: string;
  description: string;
  icon: LucideIcon;
  questions: string;
  time: string;
}

const MODE_CARDS: ModeCardData[] = [
  {
    mode: "adaptive",
    title: "Practice",
    subtitle: "Adaptive support",
    description:
      "First attempt without hints. If incorrect, glossary and hints unlock for your next try.",
    icon: Sparkles,
    questions: "10 questions",
    time: "~15 min",
  },
  {
    mode: "exam",
    title: "Exam",
    subtitle: "Test this topic",
    description:
      "Exam-like conditions for this topic only. No hints, feedback after you submit.",
    icon: ClipboardCheck,
    questions: "10 questions",
    time: "~15 min",
  },
  {
    mode: "review",
    title: "Review",
    subtitle: "Fix misconceptions",
    description:
      "Revisit questions you got wrong with targeted follow-up and compare-contrast questions.",
    icon: RefreshCw,
    questions: "Varies",
    time: "~10 min",
  },
];

export function ModeSelector({ moduleId, topicName }: ModeSelectorProps) {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/self-practice"
          className="inline-flex items-center gap-2 text-base font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-4"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
            <ArrowLeft className="w-4 h-4 text-[#14532d]" />
          </span>
          Back to Self Practice
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold font-heading text-[#14532d]">
          {topicName}
        </h1>
        <p className="text-sm text-slate-gray/60 mt-1">
          Choose how you want to practice
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {MODE_CARDS.map((card, index) => (
          <ModeCard
            key={card.mode}
            card={card}
            moduleId={moduleId}
            topicName={topicName}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

function ModeCard({
  card,
  moduleId,
  topicName,
  index,
}: {
  card: ModeCardData;
  moduleId?: number;
  topicName: string;
  index: number;
}) {
  const Icon = card.icon;
  const params = new URLSearchParams();
  if (moduleId !== undefined) {
    params.set("module", String(moduleId));
  }
  params.set("topic", topicName);
  params.set("mode", card.mode);
  const href = `/practice?${params.toString()}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
    >
      <Link
        href={href}
        className="block rounded-3xl border border-[#16a34a]/30 bg-white p-5 shadow-sm hover:shadow-md hover:border-[#16a34a] transition-all group"
      >
        <div className="flex items-center gap-3 mb-3">
          <Icon className="w-6 h-6 text-[#16a34a] flex-shrink-0" />
          <div>
            <h3 className="text-lg font-bold text-slate-gray">{card.title}</h3>
            <p className="text-xs text-[#16a34a] font-medium">
              {card.subtitle}
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-gray/70 leading-relaxed mb-3">
          {card.description}
        </p>

        <div className="flex items-center gap-3 text-xs text-slate-gray/50">
          <span>{card.questions}</span>
          <span>·</span>
          <span>{card.time}</span>
        </div>
      </Link>
    </motion.div>
  );
}
