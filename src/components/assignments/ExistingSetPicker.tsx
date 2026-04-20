"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";
import type { Question } from "@/types/question";
import { QuestionDetails } from "./QuestionDetails";

export interface QuestionSetSummary {
  id: string;
  name: string;
  generated_at: string;
  question_count: number;
}

export interface QuestionSetSelection {
  setId: string;
  questionIds: string[];
}

interface SetQuestion {
  questionId: string;
  payload: Question;
}

interface ExistingSetPickerProps {
  sets: QuestionSetSummary[];
  selection: QuestionSetSelection[];
  onChange: (next: QuestionSetSelection[]) => void;
  initiallyExpandedSetIds?: string[];
  autoSelectAllOnExpand?: Set<string>;
}

function matchesSearch(question: Question, term: string): boolean {
  if (!term) return true;
  const lower = term.toLowerCase();
  return (
    question.text.toLowerCase().includes(lower) ||
    (question.topic ?? "").toLowerCase().includes(lower) ||
    question.options.some((option) => option.text.toLowerCase().includes(lower))
  );
}

export function ExistingSetPicker({
  sets,
  selection,
  onChange,
  initiallyExpandedSetIds,
  autoSelectAllOnExpand,
}: ExistingSetPickerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(initiallyExpandedSetIds ?? []),
  );
  const [detailsExpanded, setDetailsExpanded] = useState<Set<string>>(new Set());
  const [questionsBySet, setQuestionsBySet] = useState<Record<string, SetQuestion[]>>({});
  const [loadingSets, setLoadingSets] = useState<Set<string>>(new Set());
  const [errorBySet, setErrorBySet] = useState<Record<string, string | null>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [autoApplied, setAutoApplied] = useState<Set<string>>(new Set());

  const selectionBySet = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of selection) {
      map.set(entry.setId, new Set(entry.questionIds));
    }
    return map;
  }, [selection]);

  const updateSelection = useCallback(
    (setId: string, questionIds: string[]) => {
      const unique = Array.from(new Set(questionIds));
      const others = selection.filter((entry) => entry.setId !== setId);
      if (unique.length === 0) {
        onChange(others);
        return;
      }
      onChange([...others, { setId, questionIds: unique }]);
    },
    [selection, onChange],
  );

  const loadSet = useCallback(
    async (setId: string) => {
      if (questionsBySet[setId] || loadingSets.has(setId)) return;
      setLoadingSets((prev) => {
        const next = new Set(prev);
        next.add(setId);
        return next;
      });
      setErrorBySet((prev) => ({ ...prev, [setId]: null }));
      try {
        const response = await fetch(
          `/api/assignments/manage?questionsForSetId=${encodeURIComponent(setId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          error?: string;
          questions?: Array<{ questionId: string; payload: Question }>;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load questions.");
        }
        const questions = (payload.questions ?? []).map((entry) => ({
          questionId: entry.questionId,
          payload: entry.payload,
        }));
        setQuestionsBySet((prev) => ({ ...prev, [setId]: questions }));
        if (autoSelectAllOnExpand?.has(setId) && !autoApplied.has(setId)) {
          setAutoApplied((prev) => {
            const next = new Set(prev);
            next.add(setId);
            return next;
          });
          updateSelection(
            setId,
            questions.map((entry) => entry.questionId),
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load questions.";
        setErrorBySet((prev) => ({ ...prev, [setId]: message }));
      } finally {
        setLoadingSets((prev) => {
          const next = new Set(prev);
          next.delete(setId);
          return next;
        });
      }
    },
    [questionsBySet, loadingSets, autoSelectAllOnExpand, autoApplied, updateSelection],
  );

  const toggleExpanded = useCallback(
    (setId: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(setId)) {
          next.delete(setId);
        } else {
          next.add(setId);
        }
        return next;
      });
      void loadSet(setId);
    },
    [loadSet],
  );

  useEffect(() => {
    for (const setId of expanded) {
      void loadSet(setId);
    }
  }, [expanded, loadSet]);

  useEffect(() => {
    if (!autoSelectAllOnExpand) return;
    for (const setId of autoSelectAllOnExpand) {
      void loadSet(setId);
      setExpanded((prev) => {
        if (prev.has(setId)) return prev;
        const next = new Set(prev);
        next.add(setId);
        return next;
      });
    }
  }, [autoSelectAllOnExpand, loadSet]);

  const totalSelectedCount = selection.reduce(
    (sum, entry) => sum + entry.questionIds.length,
    0,
  );
  const totalSelectedSets = selection.filter(
    (entry) => entry.questionIds.length > 0,
  ).length;

  const filteredSets = useMemo(() => {
    if (!searchTerm.trim()) return sets;
    const lower = searchTerm.toLowerCase();
    return sets.filter((set) => {
      if (set.name.toLowerCase().includes(lower)) return true;
      const questions = questionsBySet[set.id];
      if (!questions) return false;
      return questions.some((entry) => matchesSearch(entry.payload, lower));
    });
  }, [sets, searchTerm, questionsBySet]);

  const handleToggleAll = useCallback(
    (setId: string, available: SetQuestion[]) => {
      const currentSelected = selectionBySet.get(setId) ?? new Set();
      const allSelected =
        available.length > 0 &&
        available.every((entry) => currentSelected.has(entry.questionId));
      if (allSelected) {
        updateSelection(setId, []);
      } else {
        updateSelection(
          setId,
          available.map((entry) => entry.questionId),
        );
      }
    },
    [selectionBySet, updateSelection],
  );

  const handleToggleQuestion = useCallback(
    (setId: string, questionId: string) => {
      const currentSelected = new Set(selectionBySet.get(setId) ?? []);
      if (currentSelected.has(questionId)) {
        currentSelected.delete(questionId);
      } else {
        currentSelected.add(questionId);
      }
      updateSelection(setId, Array.from(currentSelected));
    },
    [selectionBySet, updateSelection],
  );

  const toggleQuestionDetails = useCallback((setId: string, questionId: string) => {
    const key = `${setId}::${questionId}`;
    setDetailsExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleSelectAllVisible = useCallback(() => {
    const updates = new Map<string, Set<string>>();
    for (const [setId, ids] of selectionBySet) {
      updates.set(setId, new Set(ids));
    }
    for (const set of filteredSets) {
      const questions = questionsBySet[set.id];
      if (!questions) continue;
      const currentIds = updates.get(set.id) ?? new Set<string>();
      for (const entry of questions) {
        if (matchesSearch(entry.payload, searchTerm.trim())) {
          currentIds.add(entry.questionId);
        }
      }
      updates.set(set.id, currentIds);
    }
    const next = Array.from(updates.entries())
      .map(([setId, ids]) => ({ setId, questionIds: Array.from(ids) }))
      .filter((entry) => entry.questionIds.length > 0);
    onChange(next);
  }, [selectionBySet, filteredSets, questionsBySet, searchTerm, onChange]);

  const handleClearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search sets or questions"
            className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSelectAllVisible}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Select all loaded
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            disabled={totalSelectedCount === 0}
          >
            Clear all
          </button>
        </div>
      </div>

      {filteredSets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-gray/70">
          No question sets match your search.
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredSets.map((set) => {
            const isExpanded = expanded.has(set.id);
            const isLoading = loadingSets.has(set.id);
            const loadError = errorBySet[set.id] ?? null;
            const questions = questionsBySet[set.id];
            const filteredQuestions = questions
              ? questions.filter((entry) => matchesSearch(entry.payload, searchTerm.trim()))
              : [];
            const selectedIds = selectionBySet.get(set.id) ?? new Set();
            const selectedCount = selectedIds.size;
            const allLoadedSelected =
              questions &&
              questions.length > 0 &&
              questions.every((entry) => selectedIds.has(entry.questionId));
            const someLoadedSelected =
              !allLoadedSelected &&
              questions &&
              questions.some((entry) => selectedIds.has(entry.questionId));

            return (
              <li
                key={set.id}
                className="rounded-lg border border-slate-200 bg-white overflow-hidden"
              >
                <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[#16a34a]"
                    checked={Boolean(allLoadedSelected)}
                    ref={(element) => {
                      if (element) {
                        element.indeterminate = Boolean(someLoadedSelected);
                      }
                    }}
                    onChange={() => {
                      if (!questions) {
                        void loadSet(set.id);
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          next.add(set.id);
                          return next;
                        });
                        return;
                      }
                      handleToggleAll(set.id, questions);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => toggleExpanded(set.id)}
                    className="flex-1 text-left flex items-center gap-2"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-gray truncate">
                        {set.name}
                      </p>
                      <p className="text-xs text-slate-gray/60 mt-0.5">
                        {set.question_count} questions •{" "}
                        {new Date(set.generated_at).toLocaleDateString()}
                        {selectedCount > 0 ? ` • ${selectedCount} selected` : ""}
                      </p>
                    </div>
                  </button>
                  {isLoading && (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3 sm:px-4">
                    {loadError ? (
                      <p className="text-sm text-red-600">{loadError}</p>
                    ) : !questions ? (
                      <p className="text-sm text-slate-gray/70 inline-flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...
                      </p>
                    ) : filteredQuestions.length === 0 ? (
                      <p className="text-sm text-slate-gray/70">
                        No questions match this search.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {filteredQuestions.map((entry, index) => {
                          const isSelected = selectedIds.has(entry.questionId);
                          const detailsKey = `${set.id}::${entry.questionId}`;
                          const showDetails = detailsExpanded.has(detailsKey);
                          return (
                            <li key={entry.questionId}>
                              <div className="rounded-md bg-white border border-slate-100 hover:border-[#16a34a]/40 transition-colors">
                                <div className="flex items-start gap-3 px-3 py-2">
                                  <input
                                    type="checkbox"
                                    id={`q-check-${set.id}-${entry.questionId}`}
                                    className="mt-1 w-4 h-4 accent-[#16a34a] cursor-pointer"
                                    checked={isSelected}
                                    onChange={() =>
                                      handleToggleQuestion(set.id, entry.questionId)
                                    }
                                  />
                                  <label
                                    htmlFor={`q-check-${set.id}-${entry.questionId}`}
                                    className="min-w-0 flex-1 cursor-pointer"
                                  >
                                    <p className="text-sm text-slate-gray">
                                      <span className="text-slate-gray/50 mr-1">
                                        Q{index + 1}.
                                      </span>
                                      {entry.payload.text}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-gray/60">
                                      {entry.payload.topic}
                                      {entry.payload.standardId
                                        ? ` • ${entry.payload.standardId}`
                                        : ""}
                                    </p>
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleQuestionDetails(set.id, entry.questionId)
                                    }
                                    className="p-1.5 rounded hover:bg-slate-100 text-slate-500 flex-shrink-0"
                                    aria-label={
                                      showDetails ? "Hide details" : "Show details"
                                    }
                                    title={
                                      showDetails ? "Hide details" : "Show details"
                                    }
                                  >
                                    {showDetails ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                                {showDetails && (
                                  <QuestionDetails question={entry.payload} />
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-sm text-slate-gray/80">
        Selected:{" "}
        <span className="font-semibold text-slate-gray">
          {totalSelectedCount} questions
        </span>{" "}
        across {totalSelectedSets} set(s)
      </p>
    </div>
  );
}

