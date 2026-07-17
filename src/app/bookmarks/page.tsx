"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  NotebookPen,
  Play,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import {
  fetchBookmarkIds,
  fetchFirstTryIncorrectQuestionIds,
  removeBookmark,
} from "@/lib/storage";
import { useQuestions } from "@/hooks/useQuestions";
import { useQuestionMedia } from "@/hooks/useQuestionMedia";
import { usePageDwell } from "@/hooks/usePageDwell";
import {
  StudentNotesList,
  useStudentNotes,
} from "@/components/notes/StudentNotesList";
import { StimulusPanel } from "@/components/short-answer/StimulusPanel";
import { isShortAnswerQuestion } from "@/lib/short-answer/question-guards";
import type { Question } from "@/types/question";
import {
  STANDARD_DEFINITIONS,
  getStandardById,
  type ModuleCode,
} from "@/lib/standards";

interface TopicGroup {
  topic: string;
  questions: Question[];
}

type ReviewTab = "needs" | "bookmarked" | "notes";

const REVIEW_MODULE_ORDER: ModuleCode[] = ["A", "B"];
const REVIEW_MODULE_LABELS: Record<ModuleCode, string> = {
  A: "Molecules to Organisms",
  B: "Continuity and Unity of Life",
};

interface ReviewCategorySelection {
  key: string;
  module: ModuleCode;
  category: string;
}

function buildReviewCategorySelections(): ReviewCategorySelection[] {
  const seen = new Set<string>();
  const result: ReviewCategorySelection[] = [];
  for (const mod of REVIEW_MODULE_ORDER) {
    for (const standard of STANDARD_DEFINITIONS.filter((item) => item.module === mod)) {
      const key = `Module ${mod} - ${standard.category}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ key, module: mod, category: standard.category });
    }
  }
  return result;
}

const REVIEW_CATEGORY_SELECTIONS = buildReviewCategorySelections();

// Module A's categories first (in curriculum order), then Module B's — first
// occurrence wins for a category name shared across modules (e.g.
// "Interdependent Relationships in Ecosystems" appears in both).
const REVIEW_CATEGORY_ORDER = new Map<string, number>();
REVIEW_CATEGORY_SELECTIONS.forEach((selection, index) => {
  if (!REVIEW_CATEGORY_ORDER.has(selection.category)) {
    REVIEW_CATEGORY_ORDER.set(selection.category, index);
  }
});

function parseReviewTab(value: string | null): ReviewTab {
  if (value === "bookmarked" || value === "notes") return value;
  return "needs";
}

const ASSIGNMENT_BUTTON_BASE_CLASS =
  "inline-flex h-11 items-center justify-center gap-2 px-5 font-bold transition duration-200";

const ASSIGNMENT_PRIMARY_BUTTON_STYLE = {
  fontSize: 16,
  lineHeight: 1.5,
  letterSpacing: "0.3px",
  wordSpacing: "1px",
  fontWeight: 700,
  borderRadius: 999,
  color: "var(--assignment-cta-text)",
  background: "var(--assignment-cta-bg-strong)",
  border: "1.5px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-cta-elevated-shadow)",
  fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
} as const;

const ASSIGNMENT_SECONDARY_BUTTON_STYLE = {
  fontSize: 16,
  lineHeight: 1.5,
  letterSpacing: "0.3px",
  wordSpacing: "1px",
  fontWeight: 700,
  borderRadius: 999,
  color: "var(--assignment-row-cta-text)",
  background: "var(--assignment-row-cta-bg)",
  border: "1.5px solid var(--assignment-row-cta-border)",
  boxShadow: "var(--assignment-row-cta-shadow)",
  fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
} as const;

export default function BookmarksPage() {
  return (
    <Suspense>
      <BookmarksPageContent />
    </Suspense>
  );
}

/** Renders the short-answer stimulus with lazily loaded media (hooks are not allowed inside the bookmark list map). */
function BookmarkStimulus({ question: questionProp }: { question: Question }) {
  const { question: hydratedQuestion, isMediaPending } =
    useQuestionMedia(questionProp);
  const question = hydratedQuestion ?? questionProp;
  if (!question.shortAnswer) return null;
  return (
    <StimulusPanel
      stem={question.shortAnswer.stem}
      stimulus={question.shortAnswer.stimulus}
      imageLoading={isMediaPending}
    />
  );
}

function BookmarksPageContent() {
  const searchParams = useSearchParams();
  // Review-tab study time for the homepage Learning effort chart. The whole
  // page counts — all three tabs (needs review / bookmarked / notes) are
  // review activity.
  usePageDwell("review_tab");
  const { visibleQuestions, isLoaded } = useQuestions();
  const {
    notes,
    isLoaded: notesLoaded,
    error: notesError,
  } = useStudentNotes();
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [firstTryWrongIds, setFirstTryWrongIds] = useState<string[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [isChoosingTopics, setIsChoosingTopics] = useState(
    () => searchParams.get("chooseTopics") === "1",
  );
  const [activeReviewTab, setActiveReviewTab] = useState<ReviewTab>(() =>
    parseReviewTab(searchParams.get("tab")),
  );
  const [selectedPracticeTopics, setSelectedPracticeTopics] = useState<string[]>([]);
  const isPreviewMode = searchParams.get("preview") === "1";

  const questionById = useMemo(() => {
    const map = new Map<string, Question>();
    for (const question of visibleQuestions) {
      map.set(question.id, question);
    }
    return map;
  }, [visibleQuestions]);

  useEffect(() => {
    if (!isLoaded) return;

    const load = async () => {
      const [bookmarkIds, wrongIds] = await Promise.all([
        fetchBookmarkIds(),
        fetchFirstTryIncorrectQuestionIds(),
      ]);
      setBookmarkedIds(bookmarkIds);
      setFirstTryWrongIds(wrongIds);
    };

    void load();
  }, [isLoaded, visibleQuestions]);

  const buildTopicGroups = useCallback(
    (ids: string[]): TopicGroup[] => {
      const byTopic = new Map<string, Question[]>();

      for (const id of ids) {
        const question = questionById.get(id);
        if (!question) continue;
        const bucket = byTopic.get(question.topic) ?? [];
        bucket.push(question);
        byTopic.set(question.topic, bucket);
      }

      return Array.from(byTopic.entries())
        .map(([topic, questions]) => ({ topic, questions }))
        .sort((a, b) => {
          const orderA = REVIEW_CATEGORY_ORDER.get(a.topic) ?? Number.MAX_SAFE_INTEGER;
          const orderB = REVIEW_CATEGORY_ORDER.get(b.topic) ?? Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return a.topic.localeCompare(b.topic);
        });
    },
    [questionById],
  );

  const pickPreviewIds = useCallback(
    (startIndex: number, count: number): string[] => {
      const pool = visibleQuestions.slice(startIndex);
      const selected: string[] = [];
      const usedTopics = new Set<string>();

      for (const question of pool) {
        if (selected.length >= count) break;
        if (usedTopics.has(question.topic)) continue;
        selected.push(question.id);
        usedTopics.add(question.topic);
      }

      if (selected.length < count) {
        for (const question of pool) {
          if (selected.length >= count) break;
          if (selected.includes(question.id)) continue;
          selected.push(question.id);
        }
      }

      return selected;
    },
    [visibleQuestions],
  );

  const previewNeedIds = useMemo(() => pickPreviewIds(0, 4), [pickPreviewIds]);
  const previewBookmarkIds = useMemo(() => pickPreviewIds(2, 4), [pickPreviewIds]);

  const effectiveNeedsIds =
    isPreviewMode && firstTryWrongIds.length === 0 ? previewNeedIds : firstTryWrongIds;
  const effectiveBookmarkedIds =
    isPreviewMode && bookmarkedIds.length === 0 ? previewBookmarkIds : bookmarkedIds;

  const needsReviewGroups = buildTopicGroups(effectiveNeedsIds);
  const bookmarkedGroups = buildTopicGroups(effectiveBookmarkedIds);

  const totalReviewQuestions = new Set([...effectiveNeedsIds, ...effectiveBookmarkedIds]).size;
  const allReviewIds = useMemo(
    () => Array.from(new Set([...effectiveNeedsIds, ...effectiveBookmarkedIds])),
    [effectiveNeedsIds, effectiveBookmarkedIds],
  );
  const questionMatchesCategory = useCallback(
    (question: Question, categorySelection: ReviewCategorySelection): boolean => {
      const expectedModule = categorySelection.module === "A" ? 1 : 2;
      if (question.module !== expectedModule) return false;

      const standard =
        typeof question.standardId === "string"
          ? getStandardById(question.standardId)
          : undefined;
      if (standard?.category === categorySelection.category) return true;

      return question.topic === categorySelection.category;
    },
    [],
  );

  const reviewCountByTopic = useMemo(() => {
    const countByTopic = new Map<string, number>();
    for (const selection of REVIEW_CATEGORY_SELECTIONS) {
      countByTopic.set(selection.key, 0);
    }

    const categoryByKey = new Map(
      REVIEW_CATEGORY_SELECTIONS.map((selection) => [selection.key, selection]),
    );

    for (const id of allReviewIds) {
      const question = questionById.get(id);
      if (!question) continue;

      for (const [key, selection] of categoryByKey.entries()) {
        if (!questionMatchesCategory(question, selection)) continue;
        countByTopic.set(key, (countByTopic.get(key) ?? 0) + 1);
        break;
      }
    }
    return countByTopic;
  }, [allReviewIds, questionById, questionMatchesCategory]);

  const availablePracticeTopics = useMemo(
    () =>
      REVIEW_CATEGORY_SELECTIONS.filter(
        (selection) => (reviewCountByTopic.get(selection.key) ?? 0) > 0,
      ).map((selection) => selection.key),
    [reviewCountByTopic],
  );

  const isAllPracticeTopicsSelected =
    availablePracticeTopics.length > 0 &&
    availablePracticeTopics.every((topic) => selectedPracticeTopics.includes(topic));

  const selectedPracticeQuestionIds = useMemo(() => {
    if (selectedPracticeTopics.length === 0) return [];
    const selectedTopicSet = new Set(selectedPracticeTopics);
    const selectedCategories = REVIEW_CATEGORY_SELECTIONS.filter((selection) =>
      selectedTopicSet.has(selection.key),
    );

    return allReviewIds.filter((id) => {
      const question = questionById.get(id);
      if (!question) return false;
      return selectedCategories.some((selection) =>
        questionMatchesCategory(question, selection),
      );
    });
  }, [allReviewIds, questionById, selectedPracticeTopics, questionMatchesCategory]);
  const practiceFromTopicsHref = useMemo(() => {
    if (selectedPracticeQuestionIds.length === 0) return null;

    const params = new URLSearchParams();
    params.set("mode", "practice");
    params.set("questionIds", selectedPracticeQuestionIds.join(","));
    return `/practice?${params.toString()}`;
  }, [selectedPracticeQuestionIds]);

  const handleRemoveBookmark = useCallback((questionId: string) => {
    removeBookmark(questionId);
    setBookmarkedIds((prev) => prev.filter((id) => id !== questionId));
  }, []);

  const handleConfirmRemoveBookmark = useCallback((questionId: string) => {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Are you sure you want to delete this item?");
      if (!confirmed) return;
    }
    handleRemoveBookmark(questionId);
  }, [handleRemoveBookmark]);

  const handleToggleTopic = useCallback(
    (section: "needs" | "bookmarked", topic: string) => {
      const key = `${section}:${topic}`;
      setExpandedTopics((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    },
    [],
  );

  const handleToggleQuestion = useCallback((questionId: string) => {
    setExpandedQuestions((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  }, []);

  const handleStartTopicSelection = useCallback(() => {
    setSelectedPracticeTopics([]);
    setIsChoosingTopics(true);
  }, []);

  const handleTogglePracticeTopic = useCallback((topic: string) => {
    const count = reviewCountByTopic.get(topic) ?? 0;
    if (count === 0) return;

    setSelectedPracticeTopics((prev) =>
      prev.includes(topic) ? prev.filter((item) => item !== topic) : [...prev, topic],
    );
  }, [reviewCountByTopic]);

  const handleToggleAllPracticeTopics = useCallback(() => {
    setSelectedPracticeTopics((prev) =>
      prev.length === availablePracticeTopics.length ? [] : availablePracticeTopics,
    );
  }, [availablePracticeTopics]);

  const renderTopicSections = (
    groups: TopicGroup[],
    section: "needs" | "bookmarked",
    allowRemoveBookmark: boolean,
  ) => {
    if (groups.length === 0) {
      const message =
        section === "needs"
          ? "Questions you answer incorrectly will appear here."
          : "Questions you bookmark will appear here.";
      return (
        <div className="rounded-2xl border border-border-subtle bg-surface p-4 text-sm text-muted-foreground">
          {message}
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        {groups.map((group, index) => {
          const topicKey = `${section}:${group.topic}`;
          const isExpanded = Boolean(expandedTopics[topicKey]);
          const topicModule = group.questions.find((question) => typeof question.module === "number")?.module;
          const moduleLabel = topicModule === 1 ? "A" : topicModule === 2 ? "B" : null;

          return (
            <div
              key={topicKey}
              className={index < groups.length - 1 ? "border-b border-border-subtle" : ""}
            >
              <button
                type="button"
                onClick={() => handleToggleTopic(section, group.topic)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/5"
              >
                <span className="min-w-0">
                  {moduleLabel ? (
                    <span className="mb-0.5 block text-xs text-muted-foreground">Module {moduleLabel}</span>
                  ) : null}
                  <span className="block text-sm font-medium text-heading">{group.topic}</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-border-subtle bg-slate-gray/5 px-2 py-0.5 text-xs font-medium text-slate-gray">
                    {group.questions.length}
                  </span>
                  <ChevronRight
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  />
                </span>
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
                    <div className="space-y-2 border-t border-border-subtle px-4 py-3">
                      {group.questions.map((question) => {
                        const isShortAnswer = isShortAnswerQuestion(question);
                        const previewText = isShortAnswer
                          ? question.shortAnswer?.stem ?? question.text
                          : question.text;

                        return (
                        <div
                          key={question.id}
                          className="overflow-hidden rounded-2xl border border-border-subtle bg-background"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleToggleQuestion(question.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleToggleQuestion(question.id);
                              }
                            }}
                            className="flex items-start justify-between gap-3 px-3 py-2 transition-colors hover:bg-foreground/5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-relaxed text-slate-gray">{previewText}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {allowRemoveBookmark ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleConfirmRemoveBookmark(question.id);
                                  }}
                                  className="flex-shrink-0 rounded-2xl p-1.5 text-slate-gray/40 transition-colors hover:bg-error-light hover:text-error"
                                  aria-label="Remove bookmark"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : null}
                              <ChevronRight
                                className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
                                  expandedQuestions[question.id] ? "rotate-90" : ""
                                }`}
                              />
                            </div>
                          </div>

                          <AnimatePresence>
                            {expandedQuestions[question.id] ? (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="space-y-3 border-t border-border-subtle px-3 py-3">
                                  {isShortAnswer && question.shortAnswer ? (
                                    <>
                                      <BookmarkStimulus question={question} />
                                      <div className="space-y-2">
                                        {question.shortAnswer.parts.map((part) => (
                                          <div
                                            key={part.label}
                                            className="rounded-2xl border border-border-subtle bg-slate-gray/5 px-3 py-2"
                                          >
                                            <div className="flex items-start gap-2.5">
                                              <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-gray/20 text-[11px] font-semibold text-muted-foreground">
                                                {part.label}
                                              </span>
                                              <p className="flex-1 text-sm text-slate-gray/90">
                                                {part.prompt}
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  ) : (
                                    question.options.map((option) => {
                                      const isCorrect = option.id === question.correctOptionId;

                                      return (
                                        <div
                                          key={option.id}
                                          className={`rounded-2xl border px-3 py-2 ${
                                            isCorrect
                                              ? "border-[var(--assignment-completed-muted)] bg-[var(--mastery-mastered-bg)]"
                                              : "border-border-subtle bg-slate-gray/5"
                                          }`}
                                        >
                                          <div className="flex items-start gap-2.5">
                                            <span
                                              className={`inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                                                isCorrect
                                                  ? "bg-[var(--assignment-completed)] text-[var(--assignment-on-accent)]"
                                                  : "bg-slate-gray/20 text-muted-foreground"
                                              }`}
                                            >
                                              {option.id.toUpperCase()}
                                            </span>
                                            <div className="flex-1">
                                              <p
                                                className={`text-sm ${
                                                  isCorrect ? "font-medium text-slate-gray" : "text-slate-gray/90"
                                                }`}
                                              >
                                                {option.text}
                                              </p>
                                              {option.feedback ? (
                                                <p className="mt-1 text-xs text-muted-foreground">{option.feedback}</p>
                                              ) : null}
                                            </div>
                                            {isCorrect ? (
                                              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[var(--assignment-completed)]" />
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  };

  if (!isLoaded) {
    return (
      <main className="h-[calc(100dvh-4rem)] overflow-hidden lg:h-dvh">
        <div
          className="mx-auto flex h-full w-full items-center justify-center px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10 xl:px-12"
          style={{ maxWidth: 1500 }}
        >
          <div className="text-slate-gray">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[calc(100dvh-4rem)] overflow-hidden lg:h-dvh">
      <div
        className="mx-auto flex h-full w-full flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10 xl:px-12"
        style={{ maxWidth: 1500 }}
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <h1 className="font-heading text-2xl font-bold text-heading sm:text-3xl">Review</h1>
          {totalReviewQuestions > 0 && !isChoosingTopics ? (
            <button
              type="button"
              onClick={handleStartTopicSelection}
              className={`${ASSIGNMENT_BUTTON_BASE_CLASS} hover:brightness-110 active:brightness-95`}
              style={ASSIGNMENT_PRIMARY_BUTTON_STYLE}
            >
              <Play className="h-4 w-4" />
              Start Practice
            </button>
          ) : !isChoosingTopics ? (
            <button
              type="button"
              disabled
              className={`${ASSIGNMENT_BUTTON_BASE_CLASS} cursor-not-allowed`}
              style={ASSIGNMENT_SECONDARY_BUTTON_STYLE}
            >
              <Play className="h-4 w-4" />
              Start Practice
            </button>
          ) : null}
        </div>

        {isChoosingTopics ? (
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

            <div className="mb-4 flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={handleToggleAllPracticeTopics}
                className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold text-heading transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                style={{
                  background: "var(--assignment-row-cta-bg)",
                  border: "1.5px solid var(--assignment-row-cta-border)",
                  boxShadow: "var(--assignment-row-cta-shadow)",
                  fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
                }}
              >
                {isAllPracticeTopicsSelected ? "Deselect all" : "Select all"}
              </button>
            </div>

            <div className="space-y-5">
              {REVIEW_MODULE_ORDER.map((module) => {
                const moduleTopics = REVIEW_CATEGORY_SELECTIONS.filter(
                  (selection) => selection.module === module,
                );
                return (
                  <div key={module}>
                    <h3
                      className="mb-2 text-sm font-semibold text-slate-gray"
                      style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
                    >
                      Module {module}: {REVIEW_MODULE_LABELS[module]}
                    </h3>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {moduleTopics.map((entry) => {
                        const count = reviewCountByTopic.get(entry.key) ?? 0;
                        const isAvailable = count > 0;
                        const isSelected = selectedPracticeTopics.includes(entry.key);

                        return (
                          <button
                            key={entry.key}
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => handleTogglePracticeTopic(entry.key)}
                            className="relative h-[98px] w-full rounded-2xl border px-3 py-3 text-center transition-colors"
                            style={{
                              background: !isAvailable
                                ? "var(--assignment-row-cta-bg)"
                                : isSelected
                                  ? "var(--mastery-mastered-bg)"
                                  : "var(--surface)",
                              border: isSelected
                                ? "2px solid var(--assignment-completed)"
                                : "1px solid var(--border-default)",
                              boxShadow: "var(--assignment-card-shadow)",
                              opacity: isAvailable ? 1 : 0.78,
                              cursor: isAvailable ? "pointer" : "not-allowed",
                            }}
                          >
                            <div className="flex h-full min-w-0 items-center justify-center">
                              <p
                                className={`max-w-[90%] text-center text-sm font-medium leading-snug ${
                                  isAvailable ? "text-slate-gray" : "text-muted-foreground"
                                }`}
                                style={{ fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
                              >
                                {entry.category}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsChoosingTopics(false)}
                className={`${ASSIGNMENT_BUTTON_BASE_CLASS} hover:bg-[var(--assignment-row-cta-bg-hover)] active:bg-[var(--assignment-row-cta-bg-active)]`}
                style={ASSIGNMENT_SECONDARY_BUTTON_STYLE}
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>

              {practiceFromTopicsHref ? (
                <Link
                  href={practiceFromTopicsHref}
                  className={`${ASSIGNMENT_BUTTON_BASE_CLASS} hover:brightness-110 active:brightness-95`}
                  style={ASSIGNMENT_PRIMARY_BUTTON_STYLE}
                >
                  <Play className="h-4 w-4" />
                  Start Practice
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className={`${ASSIGNMENT_BUTTON_BASE_CLASS} cursor-not-allowed`}
                  style={ASSIGNMENT_SECONDARY_BUTTON_STYLE}
                >
                  <Play className="h-4 w-4" />
                  Start Practice
                </button>
              )}
            </div>
          </section>
        ) : (
          <div
            className={
              activeReviewTab === "notes"
                ? "flex min-h-0 flex-1 flex-col pb-4"
                : "flex-1 overflow-y-auto pb-4"
            }
          >
            <div className="flex flex-shrink-0 flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => setActiveReviewTab("needs")}
                className={`relative inline-flex rounded-t-2xl rounded-b-none px-4 py-2.5 text-sm font-semibold transition-all ${
                  activeReviewTab === "needs"
                    ? "z-20 translate-y-0 border border-[var(--assignment-glass-border)] border-b-0 bg-surface text-heading"
                    : "z-10 translate-y-1 border border-[var(--assignment-glass-border)]/60 bg-[var(--surface)]/75 text-slate-gray/75 hover:bg-[var(--surface)]/85"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4" />
                  Need Review
                </span>
                {activeReviewTab === "needs" ? (
                  <span className="absolute bottom-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[var(--assignment-completed)]" />
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => setActiveReviewTab("bookmarked")}
                className={`relative inline-flex rounded-t-2xl rounded-b-none px-4 py-2.5 text-sm font-semibold transition-all ${
                  activeReviewTab === "bookmarked"
                    ? "z-20 translate-y-0 border border-[var(--assignment-glass-border)] border-b-0 bg-surface text-heading"
                    : "z-10 translate-y-1 border border-[var(--assignment-glass-border)]/60 bg-[var(--surface)]/75 text-slate-gray/75 hover:bg-[var(--surface)]/85"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Bookmark className="h-4 w-4" />
                  Bookmarked
                </span>
                {activeReviewTab === "bookmarked" ? (
                  <span className="absolute bottom-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[var(--assignment-completed)]" />
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => setActiveReviewTab("notes")}
                className={`relative inline-flex rounded-t-2xl rounded-b-none px-4 py-2.5 text-sm font-semibold transition-all ${
                  activeReviewTab === "notes"
                    ? "z-20 translate-y-0 border border-[var(--assignment-glass-border)] border-b-0 bg-surface text-heading"
                    : "z-10 translate-y-1 border border-[var(--assignment-glass-border)]/60 bg-[var(--surface)]/75 text-slate-gray/75 hover:bg-[var(--surface)]/85"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <NotebookPen className="h-4 w-4" />
                  Notes
                </span>
                {activeReviewTab === "notes" ? (
                  <span className="absolute bottom-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[var(--assignment-completed)]" />
                ) : null}
              </button>
            </div>

            <section
              className={`relative mt-0 rounded-tl-none rounded-tr-[28px] rounded-br-[28px] rounded-bl-[28px] border border-[var(--assignment-glass-border)] border-t-0 bg-surface p-4 sm:p-5 ${
                activeReviewTab === "notes" ? "flex min-h-0 flex-1 flex-col" : ""
              }`}
              style={{ boxShadow: "var(--assignment-card-shadow)" }}
            >
              {activeReviewTab === "needs"
                ? renderTopicSections(needsReviewGroups, "needs", false)
                : activeReviewTab === "bookmarked"
                  ? renderTopicSections(bookmarkedGroups, "bookmarked", true)
                  : (
                    <StudentNotesList
                      notes={notes}
                      isLoaded={notesLoaded}
                      error={notesError}
                      questionById={questionById}
                    />
                  )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
