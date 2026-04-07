"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock3, Play, Check } from "lucide-react";
import { MODULES } from "@/types/question";
import type { PracticeMode } from "@/types/question";

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

  const allTopics = useMemo(() => MODULES.flatMap((module) => module.topics), []);
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
          Select one or more topics. This replaces the old separate Mock Exam entry.
        </p>
        <button
          onClick={() => setSelectedTopics(allTopics)}
          className="text-xs text-[#16a34a] hover:text-[#15803d] font-medium"
        >
          Select all topics
        </button>
        <div className="space-y-4 mt-3">
          {MODULES.map((module) => (
            <div key={module.id}>
              <h3 className="text-sm font-semibold text-slate-gray mb-2">Module {module.id}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {module.topics.map((topic) => {
                  const active = selectedTopics.includes(topic);
                  return (
                    <button
                      key={topic}
                      onClick={() => toggleTopic(topic)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? "border-[#16a34a] bg-[#16a34a]/10 text-[#14532d]"
                          : "border-slate-200 bg-white text-slate-gray hover:border-[#16a34a]/40"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        {active && <Check className="w-4 h-4 text-[#16a34a]" />}
                        {topic}
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-gray/70">
          Selected topics: {selectedTopics.length}
        </p>
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
