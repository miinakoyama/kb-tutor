"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Dumbbell,
  ClipboardCheck,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import type { PracticeMode } from "@/types/question";

interface ModeSelectorProps {
  moduleId: number;
  topicName: string;
}

interface ModeCardData {
  mode: PracticeMode;
  title: string;
  subtitle: string;
  description: string;
  icon: typeof GraduationCap;
  questions: string;
  time: string;
}

const MODE_CARDS: ModeCardData[] = [
  {
    mode: "guided",
    title: "Guided",
    subtitle: "Learn with support",
    description:
      "Terms highlighted in questions, definitions sidebar, and focus hints to build your understanding.",
    icon: GraduationCap,
    questions: "5 questions",
    time: "~10 min",
  },
  {
    mode: "practice",
    title: "Practice",
    subtitle: "Build fluency",
    description:
      "Less scaffolding, optional glossary, and follow-up reasoning questions to deepen your knowledge.",
    icon: Dumbbell,
    questions: "10 questions",
    time: "~15 min",
  },
  {
    mode: "exam",
    title: "Topic Quiz",
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#16a34a] hover:text-[#15803d] transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Topics
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-gray">
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
  moduleId: number;
  topicName: string;
  index: number;
}) {
  const Icon = card.icon;
  const href = `/practice?module=${moduleId}&topic=${encodeURIComponent(topicName)}&mode=${card.mode}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
    >
      <Link
        href={href}
        className="block rounded-xl border border-[#16a34a]/30 bg-white p-5 shadow-sm hover:shadow-md hover:border-[#16a34a] transition-all group"
      >
        <div className="flex items-start gap-3 mb-3">
          <Icon className="w-5 h-5 text-[#16a34a] flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-slate-gray">
              {card.title}
            </h3>
            <p className="text-xs text-[#16a34a] font-medium">{card.subtitle}</p>
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
