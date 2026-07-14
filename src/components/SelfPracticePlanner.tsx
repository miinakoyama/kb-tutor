"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import type { PracticeMode } from "@/types/question";
import { ASSIGNMENT_MODE_META } from "@/components/assignments/assignment-design";
import { STANDARD_DEFINITIONS, type ModuleCode } from "@/lib/standards";

const MODULE_ORDER: ModuleCode[] = ["A", "B"];
const TOPIC_MODULE_LABELS: Record<ModuleCode, string> = {
  A: "Molecules to Organisms",
  B: "Continuity and Unity of Life",
};

const GEIST_FONT = "var(--font-geist), ui-sans-serif, sans-serif";

const CTA_BASE_CLASS =
  "inline-flex items-center justify-center gap-2 px-5 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
const PRIMARY_CTA_CLASS = `${CTA_BASE_CLASS} transition duration-200 hover:brightness-110 active:brightness-95`;
const SECONDARY_CTA_CLASS = `${CTA_BASE_CLASS} bg-[var(--assignment-row-cta-bg)] transition duration-200 hover:-translate-y-px hover:bg-[var(--assignment-row-cta-bg-hover)] active:translate-y-0 active:bg-[var(--assignment-row-cta-bg-active)]`;
const DISABLED_CTA_CLASS = `${CTA_BASE_CLASS} cursor-not-allowed`;

const CTA_SHARED_STYLE: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1.5,
  letterSpacing: "0.3px",
  wordSpacing: "1px",
  height: 46,
  borderRadius: 999,
  fontFamily: GEIST_FONT,
};

const PRIMARY_CTA_STYLE: React.CSSProperties = {
  ...CTA_SHARED_STYLE,
  color: "var(--assignment-cta-text)",
  background: "var(--assignment-cta-bg-strong)",
  border: "1.5px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-cta-elevated-shadow)",
};

// Background comes from the class (bg-[...]) so the hover/active bg utilities can win.
const SECONDARY_CTA_STYLE: React.CSSProperties = {
  ...CTA_SHARED_STYLE,
  color: "var(--assignment-row-cta-text)",
  border: "1.5px solid var(--assignment-row-cta-border)",
  boxShadow: "var(--assignment-row-cta-shadow)",
};

const DISABLED_CTA_STYLE: React.CSSProperties = {
  ...CTA_SHARED_STYLE,
  color: "var(--assignment-row-cta-text)",
  background: "var(--assignment-row-cta-bg)",
  border: "1.5px solid var(--assignment-row-cta-border)",
  opacity: 0.55,
};

// Hero title tier: 26px/700, 1.25, -0.4px (see design-system SKILL.md §2).
const SECTION_HEADING_STYLE: React.CSSProperties = {
  fontSize: 26,
  lineHeight: 1.25,
  letterSpacing: "-0.4px",
  fontFamily: GEIST_FONT,
};

// Row-level selectable card. Border stays 1px in both states; the selected
// ring + glow are drawn with box-shadow layers so content never shifts.
function selectableCardStyle(active: boolean): React.CSSProperties {
  return {
    background: "var(--assignment-glass-bg)",
    border: `1px solid ${active ? "var(--assignment-selected-accent)" : "var(--assignment-selectable-border)"}`,
    boxShadow: active
      ? "0 0 0 1px var(--assignment-selected-accent), 0 0 0 6px var(--assignment-selected-glow), var(--assignment-card-shadow)"
      : "var(--assignment-card-shadow)",
    backdropFilter: "blur(14px) saturate(115%)",
    WebkitBackdropFilter: "blur(14px) saturate(115%)",
  };
}

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
    <div className="mb-7 flex justify-center">
      <p className="sr-only">
        Step {currentStep} of {steps.length}: {steps[currentStep - 1]}
      </p>
      <div aria-hidden="true" className="flex items-center">
        {steps.map((label, index) => {
          const step = (index + 1) as SelfPracticeStep;
          const isCurrent = step === currentStep;
          const isDone = step < currentStep;

          return (
            <div key={label} className="flex items-center">
              {index > 0 && (
                <div
                  className="h-0.5 w-8 sm:w-12"
                  style={{
                    background:
                      step <= currentStep
                        ? "var(--assignment-completed-muted)"
                        : "var(--border-default)",
                  }}
                />
              )}
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full font-semibold transition-colors"
                style={{
                  fontSize: 14,
                  fontFamily: GEIST_FONT,
                  boxShadow: "var(--assignment-pill-highlight)",
                  ...(isCurrent
                    ? {
                        background: "var(--assignment-completed)",
                        border: "1.5px solid var(--assignment-completed)",
                        color: "var(--assignment-on-accent)",
                      }
                    : isDone
                      ? {
                          background: "var(--assignment-completed-muted)",
                          border: "1.5px solid var(--assignment-completed-muted)",
                          color: "var(--assignment-on-accent)",
                        }
                      : {
                          background: "var(--assignment-row-cta-bg)",
                          border: "1.5px solid var(--assignment-row-cta-bg)",
                          color: "var(--muted-foreground)",
                        }),
                }}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModeCard({
  mode,
  active,
  title,
  description,
  onClick,
}: {
  mode: Extract<PracticeMode, "practice" | "exam">;
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  const meta = ASSIGNMENT_MODE_META[mode];
  const Icon = meta.Icon;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="mx-auto grid min-h-[280px] w-[95%] place-items-center rounded-2xl p-5 text-center transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-[300px] sm:p-6"
      style={selectableCardStyle(active)}
    >
      <div className="mx-auto flex w-full flex-col items-center justify-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            color: meta.color,
            background: meta.pillBg,
            border: `1.5px solid ${meta.pillBorder}`,
            boxShadow: "var(--assignment-pill-highlight)",
          }}
        >
          <Icon className="h-6 w-6" />
        </div>
        <p className="mt-3 font-bold text-slate-gray" style={SECTION_HEADING_STYLE}>
          {title}
        </p>
        <p
          className="mt-1.5 text-muted-foreground"
          style={{ fontSize: 15, lineHeight: 1.5, letterSpacing: "-0.1px", fontFamily: GEIST_FONT }}
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
        <Link href={startHref} className={PRIMARY_CTA_CLASS} style={PRIMARY_CTA_STYLE}>
          <Play className="h-4 w-4" />
          {label}
        </Link>
      );
    }

    return (
      <button type="button" disabled className={DISABLED_CTA_CLASS} style={DISABLED_CTA_STYLE}>
        <Play className="h-4 w-4" />
        {label}
      </button>
    );
  };
  const startPracticeButton = buildStartButton("Start Practice");
  const startExamButton = buildStartButton("Start Exam");

  return (
    <div className="space-y-6">
      {currentStep === 1 ? (
        <section>
          <FlowProgress currentStep={currentStep} steps={flowStepLabels} />

          <h2 className="mb-2 text-center font-bold text-slate-gray" style={SECTION_HEADING_STYLE}>
            Select Mode
          </h2>

          <p
            className="mb-7 text-center text-muted-foreground"
            style={{ fontSize: 16, lineHeight: 1.5, letterSpacing: "-0.1px", fontFamily: GEIST_FONT }}
          >
            How would you like to practice?
            <br />
            Choose the experience that best matches your goal today.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            <ModeCard
              mode="practice"
              active={selectedMode === "practice"}
              title="Practice"
              description="Get feedback as you go."
              onClick={() => setSelectedMode("practice")}
            />
            <ModeCard
              mode="exam"
              active={selectedMode === "exam"}
              title="Exam"
              description="Simulate real exam conditions under test-day rules."
              onClick={() => setSelectedMode("exam")}
            />
          </div>

          <div className="mt-6 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              disabled={!hasSelectedMode}
              className={hasSelectedMode ? PRIMARY_CTA_CLASS : DISABLED_CTA_CLASS}
              style={hasSelectedMode ? PRIMARY_CTA_STYLE : DISABLED_CTA_STYLE}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      ) : currentStep === 2 ? (
        <section>
          <FlowProgress currentStep={currentStep} steps={flowStepLabels} />

          <h2 className="mb-6 text-center font-bold text-slate-gray" style={SECTION_HEADING_STYLE}>
            Choose Topics
          </h2>

          <div className="mb-6 flex items-center justify-end gap-6">
            <button
              type="button"
              onClick={() =>
                setSelectedTopics((prev) => (prev.length === ALL_KEYS.length ? [] : ALL_KEYS))
              }
              className="inline-flex items-center rounded-full bg-[var(--assignment-row-cta-bg)] px-4 py-2 font-semibold transition duration-200 hover:bg-[var(--assignment-row-cta-bg-hover)] active:bg-[var(--assignment-row-cta-bg-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              style={{
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--assignment-row-cta-text)",
                border: "1.5px solid var(--assignment-row-cta-border)",
                boxShadow: "var(--assignment-row-cta-shadow)",
                fontFamily: GEIST_FONT,
              }}
            >
              {isAllSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          <div className="space-y-6">
            {MODULE_ORDER.map((mod) => (
              <div key={mod} className="mx-auto w-[95%]">
                <h3 className="mb-6 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Module {mod}: {TOPIC_MODULE_LABELS[mod]}
                </h3>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  {CATEGORY_SELECTIONS.filter((c) => c.module === mod).map((sel) => {
                    const active = selectedTopics.includes(sel.key);

                    return (
                      <button
                        key={sel.key}
                        type="button"
                        onClick={() => toggleTopic(sel.key)}
                        aria-pressed={active}
                        className="relative h-[98px] w-full rounded-2xl px-3 py-3 text-center transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        style={selectableCardStyle(active)}
                      >
                        <div className="flex h-full min-w-0 items-center justify-center">
                          <p
                            className="max-w-[95%] text-center font-medium text-slate-gray"
                            style={{ fontSize: 15, lineHeight: 1.4, fontFamily: GEIST_FONT }}
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

          <div className="mt-6 flex items-center justify-between gap-6">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={SECONDARY_CTA_CLASS}
              style={SECONDARY_CTA_STYLE}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            {isExamFlow ? (
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                disabled={!hasSelectedTopics}
                className={hasSelectedTopics ? PRIMARY_CTA_CLASS : DISABLED_CTA_CLASS}
                style={hasSelectedTopics ? PRIMARY_CTA_STYLE : DISABLED_CTA_STYLE}
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
        <section>
          <FlowProgress currentStep={currentStep} steps={flowStepLabels} />

          <h2 className="mb-7 text-center font-bold text-slate-gray" style={SECTION_HEADING_STYLE}>
            Number of Questions
          </h2>

          <div>
            <div className="grid grid-cols-2 gap-6">
              {EXAM_QUESTION_COUNT_OPTIONS.map((count) => {
                const active = !isCustomExamCount && examQuestionCount === count;

                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      setIsCustomExamCount(false);
                      setExamQuestionCount(count);
                    }}
                    aria-pressed={active}
                    className="mx-auto min-h-[108px] w-[95%] rounded-2xl px-3 py-3 text-center transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:min-h-[124px] sm:px-4 sm:py-4"
                    style={selectableCardStyle(active)}
                  >
                    <span
                      className="block text-2xl font-bold text-slate-gray sm:text-3xl"
                      style={{ fontFamily: GEIST_FONT }}
                    >
                      {count}
                    </span>
                    <span
                      className="mt-0.5 block text-muted-foreground"
                      style={{ fontSize: 15, lineHeight: 1.5, letterSpacing: "-0.1px", fontFamily: GEIST_FONT }}
                    >
                      questions
                    </span>
                  </button>
                );
              })}
              <div
                className="mx-auto min-h-[108px] w-[95%] rounded-2xl px-3 py-3 text-center transition-all duration-200 hover:-translate-y-0.5 sm:min-h-[124px] sm:px-4 sm:py-4"
                style={selectableCardStyle(isCustomExamCount)}
              >
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
                  aria-pressed={isCustomExamCount}
                  className="w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span
                    className="block text-xl font-bold text-slate-gray sm:text-2xl"
                    style={{ fontFamily: GEIST_FONT }}
                  >
                    Custom
                  </span>
                  <span
                    className="mt-0.5 block text-muted-foreground"
                    style={{ fontSize: 15, lineHeight: 1.5, letterSpacing: "-0.1px", fontFamily: GEIST_FONT }}
                  >
                    choose your own
                  </span>
                </button>

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
                      className="mx-auto w-full max-w-xs px-4 text-center text-slate-gray placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      style={{
                        height: 38,
                        fontSize: 14,
                        borderRadius: 999,
                        background: "var(--assignment-search-bg)",
                        border: "1px solid var(--assignment-search-border)",
                        boxShadow: "var(--assignment-search-shadow)",
                        backdropFilter: "blur(14px) saturate(112%)",
                        WebkitBackdropFilter: "blur(14px) saturate(112%)",
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-6">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className={SECONDARY_CTA_CLASS}
              style={SECONDARY_CTA_STYLE}
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
