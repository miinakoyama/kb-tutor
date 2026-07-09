"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Play,
} from "lucide-react";
import type { PracticeMode } from "@/types/question";
import {
  STANDARD_DEFINITIONS,
  getStandardById,
  type ModuleCode,
} from "@/lib/standards";
import { getMasteryBand } from "@/lib/progress/mastery";
import { fetchAnswerHistory } from "@/lib/storage";

const MODULE_ORDER: ModuleCode[] = ["A", "B"];
const TOPIC_MODULE_LABELS: Record<ModuleCode, string> = {
  A: "Molecules to Organisms",
  B: "Continuity and Unity of Life",
};

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
  const band = getMasteryBand(stats.correct, stats.total);
  if (band === "mastered") {
    return { label: "Mastered", bgColor: "bg-green-100", textColor: "text-green-700" };
  }
  if (band === "on_track") {
    return { label: "Proficient", bgColor: "bg-blue-100", textColor: "text-blue-700" };
  }
  if (band === "building_up") {
    return { label: "Building up", bgColor: "bg-amber-100", textColor: "text-amber-700" };
  }
  return null;
}

const EXAM_QUESTION_COUNT_OPTIONS = [12, 24, 48] as const;
const MIN_CUSTOM_EXAM_QUESTIONS = 1;
const MAX_CUSTOM_EXAM_QUESTIONS = 200;

type SelfPracticeStep = 1 | 2 | 3;

function FlowProgress({
  currentStep,
  steps,
}: {
  currentStep: SelfPracticeStep;
  steps: string[];
}) {
  return (
    <div className="mb-6 mx-auto w-full max-w-[13rem] sm:max-w-[14rem]">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((label, index) => {
          const step = (index + 1) as SelfPracticeStep;
          const active = currentStep === step;
          const complete = currentStep > step;

          return (
            <div
              key={label}
              aria-hidden="true"
              className={`h-2 rounded-full transition-colors ${
                active
                  ? "bg-primary"
                  : complete
                    ? "bg-primary/90"
                    : "bg-primary/25"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

function ModeCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  const selectionColor = "var(--assignment-completed)";
  const cardTint = "var(--primary-light)";
  const neutralColor = "var(--border-default)";
  const frameColor = active ? selectionColor : neutralColor;

  return (
    <button
      type="button"
      onClick={onClick}
      className="grid min-h-[280px] place-items-center rounded-xl p-5 text-center transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[300px] sm:p-6"
      style={{
        background: active ? cardTint : "var(--surface)",
        border: active ? `2px solid ${selectionColor}` : `1px solid ${neutralColor}`,
        boxShadow: "var(--assignment-card-shadow)",
        backdropFilter: "blur(14px) saturate(115%)",
        WebkitBackdropFilter: "blur(14px) saturate(115%)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[220px] flex-col items-center justify-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full border"
          style={{ borderColor: frameColor, color: frameColor }}
        >
          {icon}
        </div>
        <p
          className="mt-3 font-bold text-heading"
          style={{ fontSize: 17, lineHeight: 1.35, fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
        >
          {title}
        </p>
        <p
          className="mt-1.5 text-sm text-muted-foreground"
          style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
        >
          {description}
        </p>
      </div>
    </button>
  );
}

export function SelfPracticePlanner() {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedMode, setSelectedMode] = useState<PracticeMode | null>(null);
  const [currentStep, setCurrentStep] = useState<SelfPracticeStep>(1);
  const [examQuestionCount, setExamQuestionCount] = useState<number | null>(null);
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
    if (!selectedMode) return null;
    const params = new URLSearchParams();
    params.set("mode", selectedMode);
    params.set("topics", selectedTopics.join(","));
    if (selectedMode === "exam") {
      if (examQuestionCount === null) return null;
      params.set("questions", String(examQuestionCount));
    }
    return `/practice?${params.toString()}`;
  }, [selectedMode, selectedTopics, examQuestionCount]);

  const toggleTopic = (key: string) => {
    setSelectedTopics((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key],
    );
  };

  const hasSelectedTopics = selectedTopics.length > 0;
  const hasSelectedMode = selectedMode !== null;
  const isExamFlow = selectedMode === "exam";
  const flowStepLabels = isExamFlow
    ? ["Select mode", "Choose topics", "Number of questions"]
    : ["Select mode", "Choose topics"];

  useEffect(() => {
    if (!isExamFlow && currentStep === 3) {
      setCurrentStep(2);
    }
  }, [isExamFlow, currentStep]);

  const buildStartButton = (label: string) => {
    if (startHref) {
      return (
        <Link
          href={startHref}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-bold transition duration-200 hover:-translate-y-px active:translate-y-0"
          style={{
            color: "var(--assignment-on-accent)",
            background: "var(--assignment-cta-bg-strong)",
            border: "1.5px solid var(--assignment-cta-border-hover)",
            boxShadow: "var(--assignment-cta-elevated-shadow)",
            fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
          }}
        >
          <Play className="h-4 w-4" />
          {label}
        </Link>
      );
    }

    return (
      <button
        type="button"
        disabled
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-full px-5 py-2.5 font-bold"
        style={{
          color: "var(--assignment-row-cta-text)",
          background: "var(--assignment-row-cta-bg)",
          border: "1.5px solid var(--assignment-row-cta-border)",
          boxShadow: "var(--assignment-row-cta-shadow)",
          fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
        }}
      >
        <Play className="h-4 w-4" />
        {label}
      </button>
    );
  };
  const startPracticeButton = buildStartButton("Start Practice");
  const startExamButton = buildStartButton("Start Exam");

  return (
    <div className="space-y-8">
      {currentStep === 1 ? (
        <section
          className="rounded-[28px] border p-5 sm:p-6"
          style={{
            background: "var(--assignment-glass-bg)",
            borderColor: "var(--assignment-glass-border)",
            boxShadow: "var(--assignment-card-shadow)",
            backdropFilter: "blur(14px) saturate(115%)",
            WebkitBackdropFilter: "blur(14px) saturate(115%)",
          }}
        >
          <h2
            className="mb-4 text-center text-lg font-semibold text-heading"
            style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
          >
            Select Mode
          </h2>

          <FlowProgress currentStep={currentStep} steps={flowStepLabels} />

          <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
            <ModeCard
              active={selectedMode === "practice"}
              icon={<Pencil className="h-6 w-6" />}
              title="Practice"
              description="Get feedback as you go."
              onClick={() => setSelectedMode("practice")}
            />
            <ModeCard
              active={selectedMode === "exam"}
              icon={<ClipboardCheck className="h-6 w-6" />}
              title="Exam"
              description="No hints. Just like test day."
              onClick={() => setSelectedMode("exam")}
            />
          </div>

          <div className="mt-6 flex items-center justify-end">
            {hasSelectedMode ? (
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-bold transition duration-200 hover:-translate-y-px active:translate-y-0"
                style={{
                  color: "var(--assignment-on-accent)",
                  background: "var(--assignment-cta-bg-strong)",
                  border: "1.5px solid var(--assignment-cta-border-hover)",
                  boxShadow: "var(--assignment-cta-elevated-shadow)",
                  fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
                }}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-full px-5 py-2.5 font-bold"
                style={{
                  color: "var(--assignment-row-cta-text)",
                  background: "var(--assignment-row-cta-bg)",
                  border: "1.5px solid var(--assignment-row-cta-border)",
                  boxShadow: "var(--assignment-row-cta-shadow)",
                  fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
                }}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </section>
      ) : currentStep === 2 ? (
        <section
          className="rounded-[28px] border p-5 sm:p-6"
          style={{
            background: "var(--assignment-glass-bg)",
            borderColor: "var(--assignment-glass-border)",
            boxShadow: "var(--assignment-card-shadow)",
            backdropFilter: "blur(14px) saturate(115%)",
            WebkitBackdropFilter: "blur(14px) saturate(115%)",
          }}
        >
          <h2
            className="mb-4 text-center text-lg font-semibold text-heading"
            style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
          >
            Choose Topics
          </h2>

          <FlowProgress currentStep={currentStep} steps={flowStepLabels} />

          <div className="mb-4 flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() =>
                setSelectedTopics((prev) => (prev.length === ALL_KEYS.length ? [] : ALL_KEYS))
              }
              className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold text-heading transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              style={{
                background: "var(--assignment-row-cta-bg)",
                border: "1.5px solid var(--assignment-row-cta-border)",
                boxShadow: "var(--assignment-row-cta-shadow)",
                fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              }}
            >
              {isAllSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          <div className="space-y-5">
            {MODULE_ORDER.map((mod) => (
              <div key={mod}>
                <h3 className="mb-2 text-sm font-semibold text-slate-gray">
                  Module {mod}: {TOPIC_MODULE_LABELS[mod]}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {CATEGORY_SELECTIONS.filter((c) => c.module === mod).map((sel) => {
                    const active = selectedTopics.includes(sel.key);
                    const tag = getMasteryTag(accuracyMap[sel.key]);

                    return (
                      <button
                        key={sel.key}
                        type="button"
                        onClick={() => toggleTopic(sel.key)}
                        className="relative h-[98px] w-full rounded-[22px] border px-3 py-3 text-center transition-colors"
                        style={{
                          background: active ? "var(--primary-light)" : "var(--surface)",
                          border: active
                            ? "2px solid var(--assignment-completed)"
                            : "1px solid var(--border-default)",
                          boxShadow: "var(--assignment-card-shadow)",
                        }}
                      >
                        {tag && (
                          <span
                            className={`absolute right-2 top-2 z-10 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tag.bgColor} ${tag.textColor}`}
                          >
                            {tag.label}
                          </span>
                        )}

                        <div className="flex h-full min-w-0 items-center justify-center">
                          <p
                            className="max-w-[90%] text-center text-sm font-medium leading-snug text-slate-gray"
                            style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
                          >
                            {sel.category}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-bold transition duration-200 hover:-translate-y-px active:translate-y-0"
              style={{
                color: "var(--assignment-row-cta-text)",
                background: "var(--assignment-row-cta-bg)",
                border: "1.5px solid var(--assignment-row-cta-border)",
                boxShadow: "var(--assignment-row-cta-shadow)",
                fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            {isExamFlow ? (
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                disabled={!hasSelectedTopics}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-bold transition duration-200"
                style={
                  hasSelectedTopics
                    ? {
                        color: "var(--assignment-on-accent)",
                        background: "var(--assignment-cta-bg-strong)",
                        border: "1.5px solid var(--assignment-cta-border-hover)",
                        boxShadow: "var(--assignment-cta-elevated-shadow)",
                        fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
                      }
                    : {
                        color: "var(--assignment-row-cta-text)",
                        background: "var(--assignment-row-cta-bg)",
                        border: "1.5px solid var(--assignment-row-cta-border)",
                        boxShadow: "var(--assignment-row-cta-shadow)",
                        fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
                      }
                }
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              startPracticeButton
            )}
          </div>
        </section>
      ) : (
        <section
          className="rounded-[28px] border p-5 sm:p-6"
          style={{
            background: "var(--assignment-glass-bg)",
            borderColor: "var(--assignment-glass-border)",
            boxShadow: "var(--assignment-card-shadow)",
            backdropFilter: "blur(14px) saturate(115%)",
            WebkitBackdropFilter: "blur(14px) saturate(115%)",
          }}
        >
          <h2
            className="mb-4 text-center text-lg font-semibold text-heading"
            style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
          >
            Number of Questions
          </h2>

          <FlowProgress currentStep={currentStep} steps={flowStepLabels} />

          <div className="mt-1">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {EXAM_QUESTION_COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    setIsCustomExamCount(false);
                    setExamQuestionCount(count);
                  }}
                  className="min-h-[108px] rounded-2xl border px-3 py-3 text-center transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[124px] sm:px-4 sm:py-4"
                  style={{
                    background:
                      !isCustomExamCount && examQuestionCount === count
                        ? "var(--primary-light)"
                        : "var(--surface)",
                    border:
                      !isCustomExamCount && examQuestionCount === count
                        ? "2px solid var(--assignment-completed)"
                        : "1px solid var(--border-default)",
                    boxShadow: "var(--assignment-card-shadow)",
                  }}
                >
                  <span
                    className="block text-2xl font-bold text-heading sm:text-3xl"
                    style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
                  >
                    {count}
                  </span>
                  <span
                    className="mt-0.5 block text-xs font-medium text-slate-gray sm:text-sm"
                    style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
                  >
                    questions
                  </span>
                </button>
              ))}
              <button
                type="button"
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
                className="min-h-[108px] rounded-2xl border px-3 py-3 text-center transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[124px] sm:px-4 sm:py-4"
                style={{
                  background: isCustomExamCount ? "var(--primary-light)" : "var(--surface)",
                  border: isCustomExamCount
                    ? "2px solid var(--assignment-completed)"
                    : "1px solid var(--border-default)",
                  boxShadow: "var(--assignment-card-shadow)",
                }}
              >
                <span
                  className="block text-xl font-bold text-heading sm:text-2xl"
                  style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
                >
                  Custom
                </span>
                <span
                  className="mt-0.5 block text-xs font-medium text-slate-gray sm:text-sm"
                  style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
                >
                  choose your own
                </span>
              </button>
            </div>

            <div
              className={`overflow-hidden transition-all duration-200 ${
                isCustomExamCount ? "mt-3 max-h-24 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              {isCustomExamCount ? (
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
                  placeholder="Enter question count"
                  className="w-full max-w-xs rounded-xl border border-border-default bg-surface px-4 py-3 text-sm text-slate-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                />
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-bold transition duration-200 hover:-translate-y-px active:translate-y-0"
              style={{
                color: "var(--assignment-row-cta-text)",
                background: "var(--assignment-row-cta-bg)",
                border: "1.5px solid var(--assignment-row-cta-border)",
                boxShadow: "var(--assignment-row-cta-shadow)",
                fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>

            {startExamButton}
          </div>
        </section>
      )}
    </div>
  );
}
