"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Pencil,
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

export function createEmptyDraft(): ManualQuestionDraft {
  return {
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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

export function manualDraftToQuestion(
  draft: ManualQuestionDraft,
  index: number,
): Question {
  const options = draft.options
    .map((option, optionIndex) => {
      const text = option.text.trim();
      const feedback = option.feedback.trim();
      return {
        id: option.id || `opt_${optionIndex + 1}`,
        text,
        feedback: feedback || undefined,
      };
    })
    .filter((option) => option.text.length > 0);

  const correctOptionId = options.some(
    (option) => option.id === draft.correctOptionId,
  )
    ? draft.correctOptionId
    : (options[0]?.id ?? "opt_1");

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

function validateDraft(draft: ManualQuestionDraft): string | null {
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
  const [editor, setEditor] = useState<ManualQuestionDraft>(createEmptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);
  const [isFilling, setIsFilling] = useState(false);

  const standards = useMemo(() => getAllStandards(), []);

  const canFillWithAi = useMemo(() => {
    const text = editor.text.trim();
    const validOptions = editor.options.filter(
      (option) => option.text.trim().length > 0,
    );
    return (
      text.length > 0 &&
      validOptions.length >= 2 &&
      validOptions.some((option) => option.id === editor.correctOptionId)
    );
  }, [editor]);

  const resetEditor = useCallback(() => {
    setEditor(createEmptyDraft());
    setEditingId(null);
    setShowAdvanced(false);
    setDraftError(null);
    setAiStatus(null);
  }, []);

  const handleOptionTextChange = (index: number, value: string) => {
    setEditor((prev) => ({
      ...prev,
      options: prev.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, text: value } : option,
      ),
    }));
  };

  const handleOptionFeedbackChange = (index: number, value: string) => {
    setEditor((prev) => ({
      ...prev,
      options: prev.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, feedback: value } : option,
      ),
    }));
  };

  const handleAddOption = () => {
    setEditor((prev) => {
      if (prev.options.length >= 6) return prev;
      const nextId = `opt_${prev.options.length + 1}`;
      return {
        ...prev,
        options: [...prev.options, { id: nextId, text: "", feedback: "" }],
      };
    });
  };

  const handleRemoveOption = (index: number) => {
    setEditor((prev) => {
      if (prev.options.length <= 2) return prev;
      const nextOptions = prev.options.filter(
        (_, optionIndex) => optionIndex !== index,
      );
      const reindexed = nextOptions.map((option, optionIndex) => ({
        ...option,
        id: `opt_${optionIndex + 1}`,
      }));
      const removedOption = prev.options[index];
      let nextCorrectOptionId = prev.correctOptionId;
      if (prev.correctOptionId === removedOption.id) {
        nextCorrectOptionId = reindexed[0]?.id ?? "opt_1";
      } else {
        const currentIndex = prev.options.findIndex(
          (option) => option.id === prev.correctOptionId,
        );
        const adjustedIndex =
          currentIndex > index ? currentIndex - 1 : currentIndex;
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

  const upsertDraft = () => {
    const error = validateDraft(editor);
    if (error) {
      setDraftError(error);
      return;
    }
    setDraftError(null);
    if (editingId) {
      const next = drafts.map((draft) =>
        draft.id === editingId ? editor : draft,
      );
      onChange(next);
    } else {
      onChange([...drafts, editor]);
    }
    resetEditor();
  };

  const handleEdit = (draft: ManualQuestionDraft) => {
    setEditor({
      ...draft,
      options: draft.options.map((option) => ({ ...option })),
      inlineTerms: draft.inlineTerms.map((term) => ({ ...term })),
      sidebarTerms: draft.sidebarTerms.map((term) => ({ ...term })),
    });
    setEditingId(draft.id);
    setDraftError(null);
    setAiStatus(null);
  };

  const handleDelete = (draftId: string) => {
    onChange(drafts.filter((draft) => draft.id !== draftId));
    if (editingId === draftId) {
      resetEditor();
    }
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
          text: editor.text.trim(),
          options: editor.options.map((option) => ({
            id: option.id,
            text: option.text.trim(),
            feedback: option.feedback.trim(),
          })),
          correctOptionId: editor.correctOptionId,
          standardId: editor.standardId,
          existing: {
            standardId: editor.standardId,
            dok: editor.dok,
            commonMisconception: editor.commonMisconception,
            focusHint: editor.focusHint,
            keyKnowledge: editor.keyKnowledge,
            inlineTerms: editor.inlineTerms,
            sidebarTerms: editor.sidebarTerms,
          },
        }),
      });
      const payload = (await response.json()) as FillFieldsResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "AI generation failed.");
      }
      const filled = payload.filled ?? {};
      const filledFields = payload.filledFields ?? [];

      setEditor((prev) => {
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
    index: number,
    field: keyof ManualGlossaryTermDraft,
    value: string,
  ) => {
    setEditor((prev) => ({
      ...prev,
      [key]: prev[key].map((term, termIndex) =>
        termIndex === index ? { ...term, [field]: value } : term,
      ),
    }));
  };

  const addGlossaryEntry = (key: "inlineTerms" | "sidebarTerms") => {
    setEditor((prev) => ({
      ...prev,
      [key]: [...prev[key], { term: "", definition: "", example: "" }],
    }));
  };

  const removeGlossaryEntry = (
    key: "inlineTerms" | "sidebarTerms",
    index: number,
  ) => {
    setEditor((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, termIndex) => termIndex !== index),
    }));
  };

  const draftStandardForSummary = (draft: ManualQuestionDraft) =>
    getStandardById(draft.standardId);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-gray">
            {editingId ? "Edit question" : "Write a new question"}
          </h3>
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
            value={editor.text}
            onChange={(event) =>
              setEditor((prev) => ({ ...prev, text: event.target.value }))
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
              ({editor.options.length}/6)
            </span>
          </p>
          <div className="space-y-3">
            {editor.options.map((option, index) => {
              const isCorrect = option.id === editor.correctOptionId;
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
                      name="manual-editor-correct-option"
                      checked={isCorrect}
                      onChange={() =>
                        setEditor((prev) => ({
                          ...prev,
                          correctOptionId: option.id,
                        }))
                      }
                      className="mt-2 w-4 h-4 accent-[#16a34a]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-gray/60 mb-1">
                        Option {index + 1} {isCorrect ? "(correct)" : ""}
                      </p>
                      <input
                        value={option.text}
                        onChange={(event) =>
                          handleOptionTextChange(index, event.target.value)
                        }
                        placeholder={`Answer choice ${index + 1}`}
                        className="w-full rounded-md border border-slate-200 px-2 py-1.5 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none"
                      />
                    </div>
                    {editor.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(index)}
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
                          handleOptionFeedbackChange(index, event.target.value)
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
          {editor.options.length < 6 && (
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
              value={editor.standardId}
              onChange={(event) =>
                setEditor((prev) => ({
                  ...prev,
                  standardId: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="">Select standard…</option>
              {standards.map((standard) => (
                <option key={standard.id} value={standard.id}>
                  {standard.id} — {standard.category} (Module {standard.module})
                </option>
              ))}
            </select>
            {editor.standardId && (
              <p className="mt-1 text-xs text-slate-gray/70">
                {getStandardById(editor.standardId)?.label}
              </p>
            )}
          </label>
          <label className="block text-sm text-slate-gray">
            <span className="block mb-1 font-medium">
              DOK level
              <RequiredMark />
            </span>
            <select
              value={editor.dok ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setEditor((prev) => ({
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
              value={editor.focusHint}
              onChange={(event) =>
                setEditor((prev) => ({
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
              value={editor.keyKnowledge}
              onChange={(event) =>
                setEditor((prev) => ({
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
            value={editor.commonMisconception}
            onChange={(event) =>
              setEditor((prev) => ({
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
              terms={editor.inlineTerms}
              onUpdateField={(index, field, value) =>
                updateGlossaryEntry("inlineTerms", index, field, value)
              }
              onAdd={() => addGlossaryEntry("inlineTerms")}
              onRemove={(index) => removeGlossaryEntry("inlineTerms", index)}
            />

            <GlossaryEditor
              title="Sidebar glossary terms"
              terms={editor.sidebarTerms}
              onUpdateField={(index, field, value) =>
                updateGlossaryEntry("sidebarTerms", index, field, value)
              }
              onAdd={() => addGlossaryEntry("sidebarTerms")}
              onRemove={(index) => removeGlossaryEntry("sidebarTerms", index)}
            />
          </div>
        )}

        {draftError && <p className="text-sm text-red-600">{draftError}</p>}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {editingId && (
            <button
              type="button"
              onClick={resetEditor}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel edit
            </button>
          )}
          <button
            type="button"
            onClick={upsertDraft}
            className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
          >
            <Plus className="w-4 h-4" />
            {editingId ? "Update question" : "Add question"}
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-gray mb-2">
          Drafts ({drafts.length})
        </h3>
        {drafts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-gray/70">
            No manual questions added yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((draft, index) => {
              const standard = draftStandardForSummary(draft);
              return (
                <li
                  key={draft.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-3 sm:px-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-gray">
                        <span className="text-slate-gray/50 mr-1">
                          Q{index + 1}.
                        </span>
                        {draft.text.trim() || "(empty stem)"}
                      </p>
                      <p className="mt-1 text-xs text-slate-gray/60">
                        {standard
                          ? `${standard.id} · ${standard.category}`
                          : "Standard not set"}
                        {" · "}DOK {draft.dok ?? "—"}
                        {" · "}
                        {draft.options.filter((o) => o.text.trim()).length}{" "}
                        options
                        {countOptionalFilled(draft) > 0
                          ? ` · ${countOptionalFilled(draft)} glossary group(s)`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEdit(draft)}
                        className="p-2 rounded-lg text-slate-500 hover:text-[#15803d] hover:bg-[#16a34a]/10"
                        aria-label="Edit draft"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(draft.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                        aria-label="Delete draft"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
