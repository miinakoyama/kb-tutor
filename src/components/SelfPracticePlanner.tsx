"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Play, Check } from "lucide-react";
import type { PracticeMode } from "@/types/question";
import {
  STANDARD_DEFINITIONS,
  MODULE_TITLES,
  getStandardById,
  type ModuleCode,
} from "@/lib/standards";
import { fetchAnswerHistory } from "@/lib/storage";

const MODE_CHOICES: Array<{
  mode: PracticeMode;
  title: string;
  description: string;
}> = [
  {
    mode: "practice",
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

const MODULE_ORDER: ModuleCode[] = ["A", "B"];

interface CategorySelection {
  key: string;
  module: ModuleCode;
  category: string;
}

function buildCategorySelections(): CategorySelection[] {
  const seen = new Set<string>();
  const result: CategorySelection[] = [];
  for (const mod of MODULE_ORDER) {
    for (const std of STANDARD_DEFINITIONS.filter((s) => s.module === mod)) {
      const key = `Module ${mod} - ${std.category}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ key, module: mod, category: std.category });
    }
  }
  return result;
}

const CATEGORY_SELECTIONS = buildCategorySelections();
const ALL_KEYS = CATEGORY_SELECTIONS.map((c) => c.key);

interface MasteryTag {
  label: string;
  bgColor: string;
  textColor: string;
}

function getMasteryTag(
  stats: { correct: number; total: number } | undefined,
): MasteryTag | null {
  if (!stats || stats.total === 0) return null;
  const percent = Math.round((stats.correct / stats.total) * 100);
  const { total } = stats;
  if (percent >= 85 && total >= 20) {
    return { label: "Mastered", bgColor: "bg-green-100", textColor: "text-green-700" };
  }
  if (percent >= 65 && total >= 15) {
    return { label: "Proficient", bgColor: "bg-blue-100", textColor: "text-blue-700" };
  }
  if (percent >= 45 && total >= 10) {
    return { label: "Building up", bgColor: "bg-amber-100", textColor: "text-amber-700" };
  }
  return {
    label: "Just getting started",
    bgColor: "bg-red-50",
    textColor: "text-red-600",
  };
}

const EXAM_QUESTION_COUNT_OPTIONS = [12, 24, 48] as const;
const DEFAULT_EXAM_QUESTION_COUNT = 12;
const MIN_CUSTOM_EXAM_QUESTIONS = 1;
const MAX_CUSTOM_EXAM_QUESTIONS = 200;

export function SelfPracticePlanner() {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<PracticeMode>("practice");
  const [examQuestionCount, setExamQuestionCount] = useState<number>(
    DEFAULT_EXAM_QUESTION_COUNT,
  );
  const [isCustomExamCount, setIsCustomExamCount] = useState(false);
  const [customExamCount, setCustomExamCount] = useState<string>("");
  const [accuracyMap, setAccuracyMap] = useState<
    Record<string, { correct: number; total: number }>
  >({});

  useEffect(() => {
    let cancelled = false;

    void fetchAnswerHistory().then((history) => {
      if (cancelled) return;
      const map: Record<string, { correct: number; total: number }> = {};
      for (const answer of history) {
        if (!answer.standardId) continue;
        const std = getStandardById(answer.standardId);
        if (!std) continue;
        const key = `Module ${std.module} - ${std.category}`;
        if (!map[key]) map[key] = { correct: 0, total: 0 };
        map[key].total++;
        if (answer.isCorrect) map[key].correct++;
      }
      setAccuracyMap(map);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const isAllSelected = ALL_KEYS.length > 0 && selectedTopics.length === ALL_KEYS.length;

  const startHref = useMemo(() => {
    if (selectedTopics.length === 0) return null;
    const params = new URLSearchParams();
    params.set("mode", selectedMode);
    params.set("topics", selectedTopics.join(","));
    if (selectedMode === "exam") {
      params.set("questions", String(examQuestionCount));
    }
    return `/practice?${params.toString()}`;
  }, [selectedMode, selectedTopics, examQuestionCount]);

  const toggleTopic = (key: string) => {
    setSelectedTopics((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key],
    );
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-primary/30 bg-surface p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-heading mb-2">Choose Topics</h2>
        <div className="flex items-center justify-between gap-4 mb-4">
          <button
            onClick={() =>
              setSelectedTopics((prev) => (prev.length === ALL_KEYS.length ? [] : ALL_KEYS))
            }
            className="inline-flex items-center rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-heading transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {isAllSelected ? "Deselect all" : "Select all"}
          </button>
          <span className="text-xs text-muted-foreground">
            {selectedTopics.length}/{ALL_KEYS.length} selected
          </span>
        </div>

        <div className="space-y-5">
          {MODULE_ORDER.map((mod) => (
            <div key={mod}>
              <h3 className="text-sm font-semibold text-slate-gray mb-2">
                Module {mod}: {MODULE_TITLES[mod]}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {CATEGORY_SELECTIONS.filter((c) => c.module === mod).map((sel) => {
                  const active = selectedTopics.includes(sel.key);
                  const tag = getMasteryTag(accuracyMap[sel.key]);

                  return (
                    <button
                      key={sel.key}
                      onClick={() => toggleTopic(sel.key)}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border-default bg-surface hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                            active
                              ? "bg-primary border-primary"
                              : "border-slate-gray/40 bg-surface"
                          }`}
                        >
                          {active && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-gray leading-snug">
                            {sel.category}
                          </p>
                          {tag && (
                            <span
                              className={`inline-flex items-center gap-1 mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${tag.bgColor} ${tag.textColor}`}
                            >
                              {tag.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-primary/30 bg-surface p-5 sm:p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-heading mb-2">Select Mode</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {MODE_CHOICES.map((choice) => (
            <button
              key={choice.mode}
              onClick={() => setSelectedMode(choice.mode)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                selectedMode === choice.mode
                  ? "border-primary bg-primary/10"
                  : "border-border-default hover:border-primary/40"
              }`}
            >
              <p className="text-sm font-semibold text-slate-gray">{choice.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{choice.description}</p>
            </button>
          ))}
        </div>

        {selectedMode === "exam" && (
          <div className="mt-4 pt-4 border-t border-border-subtle">
            <p className="text-sm font-medium text-slate-gray mb-2">
              Number of questions
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAM_QUESTION_COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  onClick={() => {
                    setIsCustomExamCount(false);
                    setExamQuestionCount(count);
                  }}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    !isCustomExamCount && examQuestionCount === count
                      ? "border-primary bg-primary/10 text-heading"
                      : "border-border-default text-slate-gray hover:border-primary/40"
                  }`}
                >
                  {count} questions
                </button>
              ))}
              <button
                onClick={() => {
                  setIsCustomExamCount(true);
                  if (customExamCount) {
                    const parsed = parseInt(customExamCount, 10);
                    if (!Number.isNaN(parsed)) {
                      const clamped = Math.min(
                        Math.max(parsed, MIN_CUSTOM_EXAM_QUESTIONS),
                        MAX_CUSTOM_EXAM_QUESTIONS,
                      );
                      setExamQuestionCount(clamped);
                    }
                  }
                }}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  isCustomExamCount
                    ? "border-primary bg-primary/10 text-heading"
                    : "border-border-default text-slate-gray hover:border-primary/40"
                }`}
              >
                Custom
              </button>
              {isCustomExamCount && (
                <input
                  type="number"
                  min={MIN_CUSTOM_EXAM_QUESTIONS}
                  max={MAX_CUSTOM_EXAM_QUESTIONS}
                  value={customExamCount}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCustomExamCount(value);
                    const parsed = parseInt(value, 10);
                    if (!Number.isNaN(parsed) && parsed > 0) {
                      const clamped = Math.min(
                        Math.max(parsed, MIN_CUSTOM_EXAM_QUESTIONS),
                        MAX_CUSTOM_EXAM_QUESTIONS,
                      );
                      setExamQuestionCount(clamped);
                    }
                  }}
                  placeholder="Enter a number"
                  className="w-36 rounded-lg border border-border-default px-3 py-2 text-sm text-slate-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                />
              )}
            </div>
          </div>
        )}
      </section>

      <div className="flex items-center justify-end">
        {startHref ? (
          <Link
            href={startHref}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
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
