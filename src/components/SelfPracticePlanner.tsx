"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock3, Play, Check } from "lucide-react";
import type { PracticeMode } from "@/types/question";
import {
  getStandardsForModule,
  MODULE_TITLES,
  type ModuleCode,
} from "@/lib/standards";

const MODE_CHOICES: Array<{
  mode: PracticeMode;
  title: string;
  description: string;
}> = [
  {
    mode: "adaptive",
    title: "Practice",
    description: "Adaptive attempts with hint unlock after an incorrect answer.",
  },
  {
    mode: "review",
    title: "Review",
    description: "Focus on incorrect questions from your past sessions.",
  },
  {
    mode: "exam",
    title: "Exam",
    description: "Mock exam conditions without instant feedback.",
  },
];

const TIME_PRESETS = [15, 30, 60];

interface CategorySelection {
  key: string;
  label: string;
  module: ModuleCode;
  category: string;
}

const MODULE_ORDER: ModuleCode[] = ["A", "B"];
const CATEGORY_SELECTIONS: CategorySelection[] = MODULE_ORDER.flatMap((module) => {
  const categories = Array.from(
    new Set(getStandardsForModule(module).map((standard) => standard.category))
  );
  return categories.map((category) => ({
    key: `Module ${module} - ${category}`,
    label: `Module ${module} - ${category}`,
    module,
    category,
  }));
});

function estimateQuestionCount(mode: PracticeMode, minutes: number): number {
  const pace =
    mode === "exam" ? 1.5 : mode === "review" ? 2.2 : 1.8;
  return Math.max(5, Math.min(50, Math.round(minutes / pace)));
}

export function SelfPracticePlanner() {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<PracticeMode>("adaptive");
  const [selectedMinutes, setSelectedMinutes] = useState<number>(30);
  const [customMinutes, setCustomMinutes] = useState<string>("");
  const [isCustomTime, setIsCustomTime] = useState(false);

  const allTopics = useMemo(
    () => CATEGORY_SELECTIONS.map((selection) => selection.key),
    []
  );
  const isAllSelected = allTopics.length > 0 && selectedTopics.length === allTopics.length;
  const minutes = isCustomTime
    ? Math.max(5, Number.parseInt(customMinutes || "0", 10) || 0)
    : selectedMinutes;
  const questionCount = estimateQuestionCount(selectedMode, minutes || 30);

  const startHref = useMemo(() => {
    if (selectedTopics.length === 0) return null;
    const params = new URLSearchParams();
    params.set("mode", selectedMode);
    params.set("questions", String(questionCount));
    params.set("topics", selectedTopics.map((topic) => encodeURIComponent(topic)).join(","));
    return `/practice?${params.toString()}`;
  }, [questionCount, selectedMode, selectedTopics]);

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((item) => item !== topic) : [...prev, topic],
    );
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#16a34a]/30 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[#14532d] mb-2">Choose Topics</h2>
        <p className="text-sm text-slate-gray/70 mb-4">
          Select one or more module/category areas for practice.
        </p>
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() =>
              setSelectedTopics((prev) =>
                prev.length === allTopics.length ? [] : allTopics
              )
            }
            className="inline-flex items-center rounded-lg border border-[#16a34a]/30 bg-[#16a34a]/10 px-3 py-1.5 text-xs font-semibold text-[#14532d] transition-colors hover:bg-[#16a34a]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50"
          >
            {isAllSelected ? "Deselect all areas" : "Select all areas"}
          </button>
          <span className="text-xs text-slate-gray/70">
            {selectedTopics.length}/{allTopics.length} selected
          </span>
        </div>
        <div className="space-y-4 mt-3">
          {MODULE_ORDER.map((module) => (
            <div key={module}>
              <h3 className="text-sm font-semibold text-slate-gray mb-2">
                Module {module}: {MODULE_TITLES[module]}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {CATEGORY_SELECTIONS.filter(
                  (selection) => selection.module === module
                ).map((selection) => {
                  const active = selectedTopics.includes(selection.key);
                  return (
                    <button
                      key={selection.key}
                      onClick={() => toggleTopic(selection.key)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? "border-[#16a34a] bg-[#16a34a]/10 text-[#14532d]"
                          : "border-slate-200 bg-white text-slate-gray hover:border-[#16a34a]/40"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {active && <Check className="w-4 h-4 text-[#16a34a]" />}
                        {selection.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#16a34a]/30 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[#14532d] mb-2">Select Mode</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {MODE_CHOICES.map((choice) => (
            <button
              key={choice.mode}
              onClick={() => setSelectedMode(choice.mode)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                selectedMode === choice.mode
                  ? "border-[#16a34a] bg-[#16a34a]/10"
                  : "border-slate-200 hover:border-[#16a34a]/40"
              }`}
            >
              <p className="text-sm font-semibold text-slate-gray">{choice.title}</p>
              <p className="text-xs text-slate-gray/70 mt-1">{choice.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#16a34a]/30 bg-white p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[#14532d] mb-2">Set Session Time</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {TIME_PRESETS.map((time) => (
            <button
              key={time}
              onClick={() => {
                setIsCustomTime(false);
                setSelectedMinutes(time);
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium border ${
                !isCustomTime && selectedMinutes === time
                  ? "bg-[#16a34a] text-white border-[#16a34a]"
                  : "bg-white border-slate-200 text-slate-gray hover:border-[#16a34a]/40"
              }`}
            >
              {time} mins
            </button>
          ))}
          <button
            onClick={() => setIsCustomTime(true)}
            className={`rounded-lg px-3 py-2 text-sm font-medium border ${
              isCustomTime
                ? "bg-[#16a34a] text-white border-[#16a34a]"
                : "bg-white border-slate-200 text-slate-gray hover:border-[#16a34a]/40"
            }`}
          >
            Custom
          </button>
        </div>
        {isCustomTime && (
          <input
            type="number"
            min={5}
            step={5}
            value={customMinutes}
            onChange={(event) => setCustomMinutes(event.target.value)}
            placeholder="Enter minutes"
            className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        )}
        <div className="mt-4 rounded-xl border border-[#16a34a]/20 bg-[#16a34a]/5 p-3">
          <p className="text-sm text-slate-gray flex items-center gap-2">
            <Clock3 className="w-4 h-4 text-[#16a34a]" />
            Estimated questions: <span className="font-semibold">{questionCount}</span>
          </p>
        </div>
      </section>

      <div className="flex items-center justify-end">
        {startHref ? (
          <Link
            href={startHref}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#16a34a] text-white font-medium hover:bg-[#15803d] transition-colors"
          >
            <Play className="w-4 h-4" />
            Start Practice
          </Link>
        ) : (
          <button
            disabled
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-300 text-white font-medium cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            Start Practice
          </button>
        )}
      </div>
    </div>
  );
}
