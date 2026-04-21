"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { DOKLevel, Question } from "@/types/question";
import {
  getAllStandards,
  getModuleNumberForStandard,
  getStandardById,
  getTopicForStandard,
} from "@/lib/standards";

export interface ManualGlossaryTermDraft {
  term: string;
  definition: string;
  example: string;
}

export interface ManualOptionDraft {
  id: string;
  text: string;
  feedback: string;
}

export interface ManualQuestionDraft {
  id: string;
  text: string;
  options: ManualOptionDraft[];
  correctOptionId: string;
  standardId: string;
  dok?: DOKLevel;
  commonMisconception: string;
  focusHint: string;
  keyKnowledge: string;
  inlineTerms: ManualGlossaryTermDraft[];
  sidebarTerms: ManualGlossaryTermDraft[];
}

interface ManualQuestionEditorProps {
  drafts: ManualQuestionDraft[];
  onChange: (drafts: ManualQuestionDraft[]) => void;
}

function createDefaultOptions(count = 4): ManualOptionDraft[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `opt_${index + 1}`,
    text: "",
    feedback: "",
  }));
}

function createDraftId(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyDraft(): ManualQuestionDraft {
  return {
    id: createDraftId(),
    text: "",
    options: createDefaultOptions(),
    correctOptionId: "opt_1",
    standardId: "",
    dok: undefined,
    commonMisconception: "",
    focusHint: "",
    keyKnowledge: "",
    inlineTerms: [],
    sidebarTerms: [],
  };
}

function mapGlossaryDrafts(draftId: string, terms: ManualGlossaryTermDraft[]) {
  return terms
    .map((term, termIndex) => {
      const label = term.term.trim();
      const definition = term.definition.trim();
      if (!label || !definition) return null;
      const example = term.example.trim();
      return {
        id: `${draftId}-term-${termIndex + 1}`,
        term: label,
        definition,
        ...(example ? { example } : {}),
      };
    })
    .filter((term): term is NonNullable<typeof term> => term !== null);
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

/**
 * Maximum number of answer options per manual question. Bound by
 * {@link OPTION_LETTERS} because the rest of the app displays the option id
 * directly as the choice label (A/B/C/...). Extend OPTION_LETTERS (and verify
 * downstream UI fits) if more options are ever needed.
 */
export const MAX_OPTIONS = OPTION_LETTERS.length;

function letterForIndex(index: number): string {
  const letter = OPTION_LETTERS[index];
  if (!letter) {
    throw new Error(
      `Option index ${index} exceeds MAX_OPTIONS (${MAX_OPTIONS}). Extend OPTION_LETTERS to support more options.`,
    );
  }
  return letter;
}

export function manualDraftToQuestion(
  draft: ManualQuestionDraft,
  index: number,
): Question {
  const validDraftOptions = draft.options
    .filter((option) => option.text.trim().length > 0)
    .slice(0, MAX_OPTIONS);

  const options = validDraftOptions.map((option, optionIndex) => {
    const text = option.text.trim();
    const feedback = option.feedback.trim();
    return {
      id: letterForIndex(optionIndex),
      text,
      feedback: feedback || undefined,
    };
  });

  const correctDraftIndex = validDraftOptions.findIndex(
    (option) => option.id === draft.correctOptionId,
  );
  const correctOptionId =
    correctDraftIndex >= 0
      ? letterForIndex(correctDraftIndex)
      : (options[0]?.id ?? "A");

  const inlineTerms = mapGlossaryDrafts(draft.id, draft.inlineTerms);
  const sidebarTerms = mapGlossaryDrafts(draft.id, draft.sidebarTerms);

  const standard = getStandardById(draft.standardId);
  const moduleNumber = getModuleNumberForStandard(draft.standardId);
  const topic = getTopicForStandard(draft.standardId);

  return {
    id: `manual-${Date.now()}-${index + 1}`,
    module: moduleNumber,
    topic,
    standardId: draft.standardId || undefined,
    standardLabel: standard?.label,
    text: draft.text.trim(),
    imageUrl: null,
    options,
    correctOptionId,
    commonMisconception: draft.commonMisconception.trim() || undefined,
    focusHint: draft.focusHint.trim() || undefined,
    keyKnowledge: draft.keyKnowledge.trim() || undefined,
    dok: draft.dok,
    inlineTerms: inlineTerms.length > 0 ? inlineTerms : undefined,
    sidebarTerms: sidebarTerms.length > 0 ? sidebarTerms : undefined,
    source: "manual",
    isVisible: true,
    generatedAt: new Date().toISOString(),
  };
}

export function validateDraft(draft: ManualQuestionDraft): string | null {
  const text = draft.text.trim();
  if (!text) return "Question text is required.";
  const validOptions = draft.options.filter(
    (option) => option.text.trim().length > 0,
  );
  if (validOptions.length < 2) return "Provide at least two answer options.";
  if (!validOptions.some((option) => option.id === draft.correctOptionId)) {
    return "Mark one of the options as the correct answer.";
  }
  const missingFeedback = validOptions.find(
    (option) => option.feedback.trim().length === 0,
  );
  if (missingFeedback) {
    return "Add feedback for every answer option (explains why it's right or wrong).";
  }
  if (!draft.standardId) return "Standard is required.";
  if (!draft.dok) return "DOK level is required.";
  if (!draft.focusHint.trim()) {
    return "Focus hint is required (shown to students on retry in practice mode).";
  }
  if (!draft.keyKnowledge.trim()) {
    return "Key knowledge is required (shown in final feedback).";
  }
  if (!draft.commonMisconception.trim()) {
    return "Common misconception is required (shown when a student answers incorrectly).";
  }
  return null;
}

function countOptionalFilled(draft: ManualQuestionDraft): number {
  let filled = 0;
  if (draft.inlineTerms.some((term) => term.term && term.definition))
    filled += 1;
  if (draft.sidebarTerms.some((term) => term.term && term.definition))
    filled += 1;
  return filled;
}

interface FillFieldsResponse {
  filled?: {
    optionFeedback?: Record<string, string>;
    standardId?: string;
    dok?: number;
    commonMisconception?: string;
    focusHint?: string;
    keyKnowledge?: string;
    inlineTerms?: Array<{
      term?: string;
      definition?: string;
      example?: string;
    }>;
    sidebarTerms?: Array<{
      term?: string;
      definition?: string;
      example?: string;
    }>;
  };
  filledFields?: string[];
  error?: string;
}

function RequiredMark({ title }: { title?: string }) {
  return (
    <span
      className="text-red-600 ml-0.5"
      title={title ?? "Required"}
      aria-label="Required"
    >
      *
    </span>
  );
}

export function ManualQuestionEditor({
  drafts,
  onChange,
}: ManualQuestionEditorProps) {
  const handleUpdateDraft = useCallback(
    (id: string, updater: (draft: ManualQuestionDraft) => ManualQuestionDraft) => {
      onChange(drafts.map((draft) => (draft.id === id ? updater(draft) : draft)));
    },
    [drafts, onChange],
  );

  const handleRemoveDraft = useCallback(
    (id: string) => {
      onChange(drafts.filter((draft) => draft.id !== id));
    },
    [drafts, onChange],
  );

  const handleAddDraft = useCallback(() => {
    onChange([...drafts, createEmptyDraft()]);
  }, [drafts, onChange]);

  return (
    <div className="space-y-4">
      {drafts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-gray/70">
          No questions yet. Click &quot;Add question&quot; below to start.
        </p>
      ) : (
        <ul className="space-y-4">
          {drafts.map((draft, index) => (
            <li key={draft.id}>
              <ManualQuestionCard
                draft={draft}
                index={index}
                onUpdate={(updater) => handleUpdateDraft(draft.id, updater)}
                onRemove={() => handleRemoveDraft(draft.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-start">
        <button
          type="button"
          onClick={handleAddDraft}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add question
        </button>
      </div>
    </div>
  );
}

interface ManualQuestionCardProps {
  draft: ManualQuestionDraft;
  index: number;
  onUpdate: (updater: (draft: ManualQuestionDraft) => ManualQuestionDraft) => void;
  onRemove: () => void;
}

function ManualQuestionCard({
  draft,
  index,
  onUpdate,
  onRemove,
}: ManualQuestionCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aiStatus, setAiStatus] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);
  const [isFilling, setIsFilling] = useState(false);

  const standards = useMemo(() => getAllStandards(), []);

  const canFillWithAi = useMemo(() => {
    const text = draft.text.trim();
    const validOptions = draft.options.filter(
      (option) => option.text.trim().length > 0,
    );
    return (
      text.length > 0 &&
      validOptions.length >= 2 &&
      validOptions.some((option) => option.id === draft.correctOptionId)
    );
  }, [draft]);

  const currentStandard = draft.standardId
    ? getStandardById(draft.standardId)
    : null;
  const filledOptionalGroups = countOptionalFilled(draft);

  const radioGroupName = `manual-editor-correct-${draft.id}`;

  const handleOptionTextChange = (optionIndex: number, value: string) => {
    onUpdate((prev) => ({
      ...prev,
      options: prev.options.map((option, i) =>
        i === optionIndex ? { ...option, text: value } : option,
      ),
    }));
  };

  const handleOptionFeedbackChange = (optionIndex: number, value: string) => {
    onUpdate((prev) => ({
      ...prev,
      options: prev.options.map((option, i) =>
        i === optionIndex ? { ...option, feedback: value } : option,
      ),
    }));
  };

  const handleAddOption = () => {
    onUpdate((prev) => {
      if (prev.options.length >= MAX_OPTIONS) return prev;
      const nextId = `opt_${prev.options.length + 1}`;
      return {
        ...prev,
        options: [...prev.options, { id: nextId, text: "", feedback: "" }],
      };
    });
  };

  const handleRemoveOption = (optionIndex: number) => {
    onUpdate((prev) => {
      if (prev.options.length <= 2) return prev;
      const nextOptions = prev.options.filter((_, i) => i !== optionIndex);
      const reindexed = nextOptions.map((option, i) => ({
        ...option,
        id: `opt_${i + 1}`,
      }));
      const removedOption = prev.options[optionIndex];
      let nextCorrectOptionId = prev.correctOptionId;
      if (prev.correctOptionId === removedOption.id) {
        nextCorrectOptionId = reindexed[0]?.id ?? "opt_1";
      } else {
        const currentIndex = prev.options.findIndex(
          (option) => option.id === prev.correctOptionId,
        );
        const adjustedIndex =
          currentIndex > optionIndex ? currentIndex - 1 : currentIndex;
        nextCorrectOptionId =
          reindexed[adjustedIndex]?.id ?? reindexed[0]?.id ?? "opt_1";
      }
      return {
        ...prev,
        options: reindexed,
        correctOptionId: nextCorrectOptionId,
      };
    });
  };

  const handleFillWithAi = async () => {
    if (!canFillWithAi) return;
    setIsFilling(true);
    setAiStatus(null);
    try {
      const response = await fetch("/api/enrich-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: draft.text.trim(),
          options: draft.options.map((option) => ({
            id: option.id,
            text: option.text.trim(),
            feedback: option.feedback.trim(),
          })),
          correctOptionId: draft.correctOptionId,
          standardId: draft.standardId,
          existing: {
            standardId: draft.standardId,
            dok: draft.dok,
            commonMisconception: draft.commonMisconception,
            focusHint: draft.focusHint,
            keyKnowledge: draft.keyKnowledge,
            inlineTerms: draft.inlineTerms,
            sidebarTerms: draft.sidebarTerms,
          },
        }),
      });
      const payload = (await response.json()) as FillFieldsResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "AI generation failed.");
      }
      const filled = payload.filled ?? {};
      const filledFields = payload.filledFields ?? [];

      onUpdate((prev) => {
        const nextOptions = prev.options.map((option) => {
          if (option.feedback.trim().length > 0) return option;
          const suggestion = filled.optionFeedback?.[option.id];
          if (!suggestion) return option;
          return { ...option, feedback: suggestion };
        });

        return {
          ...prev,
          options: nextOptions,
          standardId: prev.standardId || filled.standardId || prev.standardId,
          dok: prev.dok ?? (filled.dok as DOKLevel | undefined),
          commonMisconception: prev.commonMisconception.trim()
            ? prev.commonMisconception
            : (filled.commonMisconception ?? prev.commonMisconception),
          focusHint: prev.focusHint.trim()
            ? prev.focusHint
            : (filled.focusHint ?? prev.focusHint),
          keyKnowledge: prev.keyKnowledge.trim()
            ? prev.keyKnowledge
            : (filled.keyKnowledge ?? prev.keyKnowledge),
          inlineTerms:
            prev.inlineTerms.length > 0
              ? prev.inlineTerms
              : (filled.inlineTerms ?? []).map((term) => ({
                  term: term.term ?? "",
                  definition: term.definition ?? "",
                  example: term.example ?? "",
                })),
          sidebarTerms:
            prev.sidebarTerms.length > 0
              ? prev.sidebarTerms
              : (filled.sidebarTerms ?? []).map((term) => ({
                  term: term.term ?? "",
                  definition: term.definition ?? "",
                  example: term.example ?? "",
                })),
        };
      });

      if (filled.inlineTerms || filled.sidebarTerms) {
        setShowAdvanced(true);
      }

      setAiStatus({
        message:
          filledFields.length > 0
            ? `AI filled ${filledFields.length} field(s): ${filledFields.join(", ")}`
            : "All optional fields were already filled.",
        isError: false,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI generation failed.";
      setAiStatus({ message, isError: true });
    } finally {
      setIsFilling(false);
    }
  };

  const updateGlossaryEntry = (
    key: "inlineTerms" | "sidebarTerms",
    entryIndex: number,
    field: keyof ManualGlossaryTermDraft,
    value: string,
  ) => {
    onUpdate((prev) => ({
      ...prev,
      [key]: prev[key].map((term, i) =>
        i === entryIndex ? { ...term, [field]: value } : term,
      ),
    }));
  };

  const addGlossaryEntry = (key: "inlineTerms" | "sidebarTerms") => {
    onUpdate((prev) => ({
      ...prev,
      [key]: [...prev[key], { term: "", definition: "", example: "" }],
    }));
  };

  const removeGlossaryEntry = (
    key: "inlineTerms" | "sidebarTerms",
    entryIndex: number,
  ) => {
    onUpdate((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== entryIndex),
    }));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="flex flex-1 min-w-0 items-start gap-2 text-left"
          aria-expanded={!isCollapsed}
        >
          <span className="mt-0.5 inline-flex items-center justify-center rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-gray">
              Question {index + 1}
            </p>
            {isCollapsed && (
              <>
                <p className="mt-1 text-sm text-slate-gray truncate">
                  {draft.text.trim() || (
                    <span className="italic text-slate-gray/60">
                      (empty stem)
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-gray/60">
                  {currentStandard
                    ? `${currentStandard.id} · ${currentStandard.category}`
                    : "Standard not set"}
                  {" · "}DOK {draft.dok ?? "—"}
                  {" · "}
                  {draft.options.filter((o) => o.text.trim()).length} options
                  {filledOptionalGroups > 0
                    ? ` · ${filledOptionalGroups} glossary group(s)`
                    : ""}
                </p>
              </>
            )}
          </div>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
          aria-label={`Remove question ${index + 1}`}
          title="Remove question"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {!isCollapsed && (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleFillWithAi}
              disabled={!canFillWithAi || isFilling}
              title={
                canFillWithAi
                  ? "Populate empty fields (option feedback, standard, DOK, glossary, ...) using AI"
                  : "Fill with AI needs: question stem, at least 2 option texts, and the correct answer selected"
              }
              className="inline-flex items-center gap-2 rounded-lg border border-[#16a34a]/30 bg-[#16a34a]/10 px-3 py-2 text-sm font-medium text-[#15803d] hover:bg-[#16a34a]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFilling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Fill with AI
            </button>
            <p className="inline-flex items-center gap-1 text-xs text-slate-gray/70">
              <Info className="w-3 h-3" />
              Needs stem + 2+ option texts + correct answer
            </p>
          </div>

          {aiStatus && (
            <p
              className={`text-sm ${
                aiStatus.isError ? "text-red-600" : "text-[#15803d]"
              }`}
            >
              {aiStatus.message}
            </p>
          )}

          <p className="text-xs text-slate-gray/60">
            Fields marked with <span className="text-red-600">*</span> are
            required.
          </p>

          <label className="block text-sm text-slate-gray">
            <span className="block mb-1 font-medium">
              Question text
              <RequiredMark />
            </span>
            <textarea
              value={draft.text}
              onChange={(event) =>
                onUpdate((prev) => ({ ...prev, text: event.target.value }))
              }
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none"
              placeholder="Write the question stem..."
            />
          </label>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-gray">
              Answer options
              <RequiredMark title="Each option needs text and feedback. Mark the correct one." />
              <span className="text-slate-gray/60 font-normal ml-1">
                ({draft.options.length}/{MAX_OPTIONS})
              </span>
            </p>
            <div className="space-y-3">
              {draft.options.map((option, optionIndex) => {
                const isCorrect = option.id === draft.correctOptionId;
                return (
                  <div
                    key={option.id}
                    className={`rounded-lg border px-3 py-3 space-y-2 ${
                      isCorrect
                        ? "border-[#16a34a]/40 bg-[#16a34a]/5"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="radio"
                        name={radioGroupName}
                        checked={isCorrect}
                        onChange={() =>
                          onUpdate((prev) => ({
                            ...prev,
                            correctOptionId: option.id,
                          }))
                        }
                        className="mt-2 w-4 h-4 accent-[#16a34a]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-gray/60 mb-1">
                          Option {optionIndex + 1}{" "}
                          {isCorrect ? "(correct)" : ""}
                        </p>
                        <input
                          value={option.text}
                          onChange={(event) =>
                            handleOptionTextChange(
                              optionIndex,
                              event.target.value,
                            )
                          }
                          placeholder={`Answer choice ${optionIndex + 1}`}
                          className="w-full rounded-md border border-slate-200 px-2 py-1.5 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none"
                        />
                      </div>
                      {draft.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(optionIndex)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          aria-label="Remove option"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="pl-6">
                      <label className="block text-xs text-slate-gray/80">
                        <span className="block mb-1">
                          Feedback
                          <RequiredMark title="Why is this option right or wrong? Shown after the student answers." />
                        </span>
                        <textarea
                          value={option.feedback}
                          onChange={(event) =>
                            handleOptionFeedbackChange(
                              optionIndex,
                              event.target.value,
                            )
                          }
                          rows={2}
                          placeholder={
                            isCorrect
                              ? "Why this answer is correct."
                              : "Why this option is incorrect, and what misconception it targets."
                          }
                          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            {draft.options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={handleAddOption}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Add option
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-sm text-slate-gray">
              <span className="block mb-1 font-medium">
                Standard
                <RequiredMark title="Required. If blank, Fill with AI can suggest one." />
              </span>
              <select
                value={draft.standardId}
                onChange={(event) =>
                  onUpdate((prev) => ({
                    ...prev,
                    standardId: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">Select standard…</option>
                {standards.map((standard) => (
                  <option key={standard.id} value={standard.id}>
                    {standard.id} — {standard.category} (Module{" "}
                    {standard.module})
                  </option>
                ))}
              </select>
              {draft.standardId && (
                <p className="mt-1 text-xs text-slate-gray/70">
                  {getStandardById(draft.standardId)?.label}
                </p>
              )}
            </label>
            <label className="block text-sm text-slate-gray">
              <span className="block mb-1 font-medium">
                DOK level
                <RequiredMark />
              </span>
              <select
                value={draft.dok ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  onUpdate((prev) => ({
                    ...prev,
                    dok:
                      value === "1"
                        ? 1
                        : value === "2"
                          ? 2
                          : value === "3"
                            ? 3
                            : undefined,
                  }));
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              >
                <option value="">Select DOK…</option>
                <option value="1">1 - Recall</option>
                <option value="2">2 - Skill / Concept</option>
                <option value="3">3 - Strategic Thinking</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-sm text-slate-gray md:col-span-1">
              <span className="block mb-1 font-medium">
                Focus hint
                <RequiredMark title="Short nudge shown to students on retry in practice mode." />
              </span>
              <input
                value={draft.focusHint}
                onChange={(event) =>
                  onUpdate((prev) => ({
                    ...prev,
                    focusHint: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Short nudge shown on retry."
              />
            </label>
            <label className="block text-sm text-slate-gray md:col-span-1">
              <span className="block mb-1 font-medium">
                Key knowledge
                <RequiredMark title="One-line summary of the core idea. Shown in final feedback." />
              </span>
              <input
                value={draft.keyKnowledge}
                onChange={(event) =>
                  onUpdate((prev) => ({
                    ...prev,
                    keyKnowledge: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="One-line summary of the concept required."
              />
            </label>
          </div>

          <label className="block text-sm text-slate-gray">
            <span className="block mb-1 font-medium">
              Common misconception
              <RequiredMark title="What students often get wrong here. Shown when the answer is incorrect." />
            </span>
            <textarea
              value={draft.commonMisconception}
              onChange={(event) =>
                onUpdate((prev) => ({
                  ...prev,
                  commonMisconception: event.target.value,
                }))
              }
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              placeholder="What misconception does this question surface?"
            />
          </label>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((prev) => !prev)}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-[#15803d]"
            >
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              Optional glossary terms
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <GlossaryEditor
                title="Inline glossary terms"
                terms={draft.inlineTerms}
                onUpdateField={(entryIndex, field, value) =>
                  updateGlossaryEntry("inlineTerms", entryIndex, field, value)
                }
                onAdd={() => addGlossaryEntry("inlineTerms")}
                onRemove={(entryIndex) =>
                  removeGlossaryEntry("inlineTerms", entryIndex)
                }
              />

              <GlossaryEditor
                title="Sidebar glossary terms"
                terms={draft.sidebarTerms}
                onUpdateField={(entryIndex, field, value) =>
                  updateGlossaryEntry("sidebarTerms", entryIndex, field, value)
                }
                onAdd={() => addGlossaryEntry("sidebarTerms")}
                onRemove={(entryIndex) =>
                  removeGlossaryEntry("sidebarTerms", entryIndex)
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface GlossaryEditorProps {
  title: string;
  terms: ManualGlossaryTermDraft[];
  onUpdateField: (
    index: number,
    field: keyof ManualGlossaryTermDraft,
    value: string,
  ) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

function GlossaryEditor({
  title,
  terms,
  onUpdateField,
  onAdd,
  onRemove,
}: GlossaryEditorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-gray">{title}</p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Add term
        </button>
      </div>
      {terms.length === 0 ? (
        <p className="text-xs text-slate-gray/60">No terms added.</p>
      ) : (
        <ul className="space-y-2">
          {terms.map((term, index) => (
            <li
              key={index}
              className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={term.term}
                  onChange={(event) =>
                    onUpdateField(index, "term", event.target.value)
                  }
                  placeholder="Term"
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5"
                />
                <input
                  value={term.example}
                  onChange={(event) =>
                    onUpdateField(index, "example", event.target.value)
                  }
                  placeholder="Example (optional)"
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5"
                />
              </div>
              <textarea
                value={term.definition}
                onChange={(event) =>
                  onUpdateField(index, "definition", event.target.value)
                }
                placeholder="Definition"
                rows={2}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
