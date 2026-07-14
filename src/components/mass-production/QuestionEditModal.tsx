"use client";

import { useState, useEffect } from "react";
import { X, Save, Plus, Trash2 } from "lucide-react";
import type { Question, DOKLevel, GlossaryTerm } from "@/types/question";
import type {
  ChartData,
  KeyTerm,
  PartLabel,
  ShortAnswerItem,
  StimulusAsset,
} from "@/types/short-answer";
import { getAllStandards } from "@/lib/standards";
import { normalizeQuestionGlossaryTerms } from "@/lib/glossary";
import { fetchActiveKcsForStandard, type KnowledgeComponent } from "@/lib/knowledge-components";

const ALL_STANDARDS = getAllStandards();
type GlossaryListKey = "inlineTerms" | "sidebarTerms";
type EditableGlossaryField = "term" | "definition" | "example";
type ShortAnswerPartField = "prompt" | "taskType" | "scoringGuidance";
type ShortAnswerNumericPartField = "maxScore" | "maxLength";
type StimulusTextField =
  | "tableMarkdown"
  | "diagramSvg"
  | "scenarioText"
  | "illustrationPrompt";
type KeyTermField = "term" | "definition";
let glossaryIdFallbackCounter = 0;

function getGlossaryTerms(question: Question, listKey: GlossaryListKey): GlossaryTerm[] {
  return [...(question[listKey] ?? [])];
}

function generateGlossaryTermId(prefix: string, index: number): string {
  const cryptoApi: Crypto | undefined =
    typeof window !== "undefined" ? window.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = new Uint8Array(8);
    cryptoApi.getRandomValues(bytes);
    const randomHex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return `${prefix}-${randomHex}`;
  }

  glossaryIdFallbackCounter += 1;
  return `${prefix}-${Date.now()}-${index + 1}-${glossaryIdFallbackCounter}`;
}

function createNewGlossaryTerm(listKey: GlossaryListKey, index: number): GlossaryTerm {
  const prefix = listKey === "inlineTerms" ? "inline" : "sidebar";
  return {
    id: generateGlossaryTermId(prefix, index),
    term: "",
    definition: "",
    example: "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChartData(value: unknown): value is ChartData {
  if (!isRecord(value)) return false;
  if (typeof value.xLabel !== "string" || typeof value.yLabel !== "string") {
    return false;
  }
  if (!Array.isArray(value.series)) return false;
  return value.series.every((series) => {
    if (!isRecord(series) || typeof series.name !== "string") return false;
    if (!Array.isArray(series.points)) return false;
    return series.points.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        (typeof point[0] === "string" || typeof point[0] === "number") &&
        typeof point[1] === "number",
    );
  });
}

function getStimulusText(stimulus: StimulusAsset): string {
  switch (stimulus.type) {
    case "table":
      return stimulus.tableMarkdown;
    case "diagram":
      return stimulus.diagramSvg;
    case "scenario":
      return stimulus.scenarioText;
    case "illustration":
      return stimulus.illustrationPrompt;
    case "line_graph":
    case "bar_chart":
      return JSON.stringify(stimulus.chartData, null, 2);
  }
}

function stimulusTextField(stimulus: StimulusAsset): StimulusTextField | null {
  switch (stimulus.type) {
    case "table":
      return "tableMarkdown";
    case "diagram":
      return "diagramSvg";
    case "scenario":
      return "scenarioText";
    case "illustration":
      return "illustrationPrompt";
    case "line_graph":
    case "bar_chart":
      return null;
  }
}

interface QuestionEditModalProps {
  question: Question;
  onSave: (updated: Question) => void;
  onClose: () => void;
}

export function QuestionEditModal({
  question,
  onSave,
  onClose,
}: QuestionEditModalProps) {
  const [edited, setEdited] = useState<Question>(question);
  const [chartDataDraft, setChartDataDraft] = useState(() => {
    const stimulus = question.shortAnswer?.stimulus;
    return stimulus?.type === "line_graph" || stimulus?.type === "bar_chart"
      ? JSON.stringify(stimulus.chartData, null, 2)
      : "";
  });
  const [chartDataError, setChartDataError] = useState<string | null>(null);
  const [availableKcs, setAvailableKcs] = useState<KnowledgeComponent[]>([]);
  const [kcsLoading, setKcsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const standardId = edited.standardId ?? "";
    if (!standardId) {
      setAvailableKcs([]);
      return;
    }
    setKcsLoading(true);
    void fetchActiveKcsForStandard(standardId).then((kcs) => {
      if (!cancelled) {
        setAvailableKcs(kcs);
        setKcsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [edited.standardId]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    setEdited(question);
    const stimulus = question.shortAnswer?.stimulus;
    setChartDataDraft(
      stimulus?.type === "line_graph" || stimulus?.type === "bar_chart"
        ? JSON.stringify(stimulus.chartData, null, 2)
        : "",
    );
    setChartDataError(null);
  }, [question]);

  const handleOptionChange = (
    optionId: string,
    field: "text" | "feedback",
    value: string
  ) => {
    setEdited((prev) => ({
      ...prev,
      options: prev.options.map((opt) =>
        opt.id === optionId ? { ...opt, [field]: value } : opt
      ),
    }));
  };

  const handleAddGlossaryTerm = (listKey: GlossaryListKey) => {
    setEdited((prev) => {
      const currentTerms = getGlossaryTerms(prev, listKey);
      const nextTerms = [...currentTerms, createNewGlossaryTerm(listKey, currentTerms.length)];
      if (listKey === "inlineTerms") {
        return { ...prev, inlineTerms: nextTerms };
      }
      return { ...prev, sidebarTerms: nextTerms };
    });
  };

  const handleGlossaryTermChange = (
    listKey: GlossaryListKey,
    termId: string,
    field: EditableGlossaryField,
    value: string,
  ) => {
    setEdited((prev) => {
      const currentTerms = getGlossaryTerms(prev, listKey);
      const nextTerms = currentTerms.map((term) =>
        term.id === termId ? { ...term, [field]: value } : term,
      );
      if (listKey === "inlineTerms") {
        return { ...prev, inlineTerms: nextTerms };
      }
      return { ...prev, sidebarTerms: nextTerms };
    });
  };

  const handleRemoveGlossaryTerm = (listKey: GlossaryListKey, termId: string) => {
    setEdited((prev) => {
      const currentTerms = getGlossaryTerms(prev, listKey);
      const nextTerms = currentTerms.filter((term) => term.id !== termId);
      if (listKey === "inlineTerms") {
        return { ...prev, inlineTerms: nextTerms };
      }
      return { ...prev, sidebarTerms: nextTerms };
    });
  };

  const updateShortAnswer = (
    updater: (item: ShortAnswerItem) => ShortAnswerItem,
  ) => {
    setEdited((prev) => {
      if (prev.questionType !== "open-ended" || !prev.shortAnswer) return prev;
      const shortAnswer = updater(prev.shortAnswer);
      return {
        ...prev,
        text: shortAnswer.parts[0]?.prompt ?? shortAnswer.stem,
        shortAnswer,
      };
    });
  };

  const handleShortAnswerStemChange = (value: string) => {
    updateShortAnswer((item) => ({ ...item, stem: value }));
  };

  const handleStimulusTitleChange = (value: string) => {
    updateShortAnswer((item) => ({
      ...item,
      stimulus: { ...item.stimulus, title: value },
    }));
  };

  const handleStimulusTextChange = (field: StimulusTextField, value: string) => {
    updateShortAnswer((item) => {
      switch (item.stimulus.type) {
        case "table":
          return field === "tableMarkdown"
            ? { ...item, stimulus: { ...item.stimulus, tableMarkdown: value } }
            : item;
        case "diagram":
          return field === "diagramSvg"
            ? { ...item, stimulus: { ...item.stimulus, diagramSvg: value } }
            : item;
        case "scenario":
          return field === "scenarioText"
            ? { ...item, stimulus: { ...item.stimulus, scenarioText: value } }
            : item;
        case "illustration":
          return field === "illustrationPrompt"
            ? { ...item, stimulus: { ...item.stimulus, illustrationPrompt: value } }
            : item;
        case "line_graph":
        case "bar_chart":
          return item;
      }
    });
  };

  const handleChartDataChange = (value: string) => {
    setChartDataDraft(value);
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setChartDataError("Enter valid chart data JSON.");
      return;
    }
    if (!isChartData(parsed)) {
      setChartDataError(
        "Chart data must include xLabel, yLabel, and series with points.",
      );
      return;
    }
    setChartDataError(null);
    updateShortAnswer((item) => {
      switch (item.stimulus.type) {
        case "line_graph":
        case "bar_chart":
          return { ...item, stimulus: { ...item.stimulus, chartData: parsed } };
        case "table":
        case "diagram":
        case "scenario":
        case "illustration":
          return item;
      }
    });
  };

  const handlePartTextChange = (
    label: PartLabel,
    field: ShortAnswerPartField,
    value: string,
  ) => {
    updateShortAnswer((item) => ({
      ...item,
      parts: item.parts.map((part) =>
        part.label === label ? { ...part, [field]: value } : part,
      ),
    }));
  };

  const handlePartNumberChange = (
    label: PartLabel,
    field: ShortAnswerNumericPartField,
    value: string,
  ) => {
    const parsed = Number.parseInt(value, 10);
    const nextValue = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
    updateShortAnswer((item) => ({
      ...item,
      parts: item.parts.map((part) =>
        part.label === label
          ? {
              ...part,
              [field]: nextValue,
              rubric:
                field === "maxScore"
                  ? { ...part.rubric, pointsPossible: nextValue }
                  : part.rubric,
            }
          : part,
      ),
    }));
  };

  const handlePartRubricCriteriaChange = (
    label: PartLabel,
    score: string,
    value: string,
  ) => {
    updateShortAnswer((item) => ({
      ...item,
      parts: item.parts.map((part) =>
        part.label === label
          ? {
              ...part,
              rubric: {
                pointsPossible: part.rubric?.pointsPossible ?? part.maxScore,
                criteria: {
                  ...(part.rubric?.criteria ?? {}),
                  [score]: value,
                },
              },
            }
          : part,
      ),
    }));
  };

  const handleKeyTermChange = (
    index: number,
    field: KeyTermField,
    value: string,
  ) => {
    updateShortAnswer((item) => ({
      ...item,
      keyTerms: item.keyTerms.map((term, termIndex) =>
        termIndex === index ? { ...term, [field]: value } : term,
      ),
    }));
  };

  const handleAddKeyTerm = () => {
    updateShortAnswer((item) => ({
      ...item,
      keyTerms: [...item.keyTerms, { term: "", definition: "" } satisfies KeyTerm],
    }));
  };

  const handleRemoveKeyTerm = (index: number) => {
    updateShortAnswer((item) => ({
      ...item,
      keyTerms: item.keyTerms.filter((_, termIndex) => termIndex !== index),
    }));
  };

  const handleSave = () => {
    if (edited.questionType === "open-ended" && edited.shortAnswer) {
      if (chartDataError) return;
      onSave({
        ...edited,
        text: edited.shortAnswer.parts[0]?.prompt ?? edited.shortAnswer.stem,
        options: [],
        correctOptionId: "",
      });
      onClose();
      return;
    }

    const { inlineTerms, sidebarTerms } = normalizeQuestionGlossaryTerms(
      edited.inlineTerms,
      edited.sidebarTerms,
      edited.id,
    );
    onSave({
      ...edited,
      includeInSelfPractice: edited.kcCode
        ? edited.includeInSelfPractice
        : false,
      inlineTerms,
      sidebarTerms,
    });
    onClose();
  };

  const shortAnswerItem =
    edited.questionType === "open-ended" ? edited.shortAnswer : undefined;
  const stimulusField = shortAnswerItem
    ? stimulusTextField(shortAnswerItem.stimulus)
    : null;
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 pt-4 sm:pt-4 bg-black/50 overflow-y-auto">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] sm:max-h-[90vh] overflow-hidden flex flex-col my-auto">
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-slate-gray">
            {shortAnswerItem ? "Edit Short-answer Question" : "Edit Question"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {shortAnswerItem ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-gray mb-1">
                  Question Stem
                </label>
                <textarea
                  value={shortAnswerItem.stem}
                  onChange={(e) => handleShortAnswerStemChange(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-gray mb-1">
                    Topic
                  </label>
                  <input
                    type="text"
                    value={edited.topic}
                    onChange={(e) =>
                      setEdited((prev) => ({ ...prev, topic: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-gray mb-1">
                    Standard
                  </label>
                  <select
                    value={edited.standardId || ""}
                    onChange={(e) => {
                      const selected = ALL_STANDARDS.find(
                        (item) => item.id === e.target.value,
                      );
                      setEdited((prev) => ({
                        ...prev,
                        standardId: e.target.value,
                        standardLabel: selected?.label,
                      }));
                    }}
                    className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                  >
                    <option value="">Select standard</option>
                    {ALL_STANDARDS.map((standard) => (
                      <option key={standard.id} value={standard.id}>
                        {standard.id} - {standard.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-border-default p-3 sm:p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-slate-gray">
                    Stimulus
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Type: {shortAnswerItem.stimulus.type}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-gray mb-1">
                    Stimulus Title
                  </label>
                  <input
                    type="text"
                    value={shortAnswerItem.stimulus.title}
                    onChange={(e) => handleStimulusTitleChange(e.target.value)}
                    className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                  />
                </div>
                {stimulusField ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-gray mb-1">
                      Stimulus Content
                    </label>
                    <textarea
                      value={getStimulusText(shortAnswerItem.stimulus)}
                      onChange={(e) =>
                        handleStimulusTextChange(stimulusField, e.target.value)
                      }
                      rows={6}
                      className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm font-mono resize-y"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-gray mb-1">
                      Chart Data JSON
                    </label>
                    <textarea
                      value={chartDataDraft}
                      onChange={(e) => handleChartDataChange(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm font-mono resize-y"
                    />
                    {chartDataError && (
                      <p className="mt-1 text-xs text-error">{chartDataError}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-gray">Parts</p>
                {shortAnswerItem.parts.map((part) => (
                  <div
                    key={part.label}
                    className="rounded-lg border border-border-default p-3 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-primary text-white text-sm font-semibold flex items-center justify-center">
                        {part.label}
                      </span>
                      <p className="text-sm font-medium text-slate-gray">
                        Part {part.label}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-gray mb-1">
                        Prompt
                      </label>
                      <textarea
                        value={part.prompt}
                        onChange={(e) =>
                          handlePartTextChange(part.label, "prompt", e.target.value)
                        }
                        rows={2}
                        className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-gray mb-1">
                          Task Type
                        </label>
                        <input
                          type="text"
                          value={part.taskType}
                          onChange={(e) =>
                            handlePartTextChange(
                              part.label,
                              "taskType",
                              e.target.value,
                            )
                          }
                          className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-gray mb-1">
                          Max Score
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={part.maxScore}
                          onChange={(e) =>
                            handlePartNumberChange(
                              part.label,
                              "maxScore",
                              e.target.value,
                            )
                          }
                          className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-gray mb-1">
                          Max Length
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={part.maxLength}
                          onChange={(e) =>
                            handlePartNumberChange(
                              part.label,
                              "maxLength",
                              e.target.value,
                            )
                          }
                          className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-gray mb-1">
                        Part Rubric
                      </label>
                      {part.rubric ? (
                        <div className="space-y-2">
                          {Object.keys(part.rubric.criteria)
                            .sort((a, b) => Number(b) - Number(a))
                            .map((score) => (
                              <div key={score}>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">
                                  Score {score}
                                </label>
                                <textarea
                                  value={part.rubric.criteria[score] ?? ""}
                                  onChange={(e) =>
                                    handlePartRubricCriteriaChange(
                                      part.label,
                                      score,
                                      e.target.value,
                                    )
                                  }
                                  rows={2}
                                  className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
                                />
                              </div>
                            ))}
                        </div>
                      ) : (
                        <textarea
                          value={part.scoringGuidance}
                          onChange={(e) =>
                            handlePartTextChange(
                              part.label,
                              "scoringGuidance",
                              e.target.value,
                            )
                          }
                          rows={3}
                          className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border-default p-3 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-gray">Key Terms</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Terms shown with the short-answer item.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddKeyTerm}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/30 text-xs font-medium text-forest hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add term
                  </button>
                </div>
                {shortAnswerItem.keyTerms.length === 0 ? (
                  <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border-default p-2.5">
                    No terms yet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {shortAnswerItem.keyTerms.map((term, index) => (
                      <div
                        key={`${term.term}-${index}`}
                        className="rounded-lg border border-border-default bg-surface-muted/40 p-2.5"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-xs text-muted-foreground">
                            Term {index + 1}
                          </p>
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyTerm(index)}
                            className="inline-flex items-center gap-1 text-xs text-error hover:text-error"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">
                              Term
                            </label>
                            <input
                              type="text"
                              value={term.term}
                              onChange={(e) =>
                                handleKeyTermChange(index, "term", e.target.value)
                              }
                              className="w-full px-2.5 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">
                              Definition
                            </label>
                            <input
                              type="text"
                              value={term.definition}
                              onChange={(e) =>
                                handleKeyTermChange(
                                  index,
                                  "definition",
                                  e.target.value,
                                )
                              }
                              className="w-full px-2.5 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
          <div>
            <label className="block text-sm font-medium text-slate-gray mb-1">
              Question Text
            </label>
            <textarea
              value={edited.text}
              onChange={(e) => setEdited((prev) => ({ ...prev, text: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-gray mb-1">
                Topic
              </label>
              <input
                type="text"
                value={edited.topic}
                onChange={(e) =>
                  setEdited((prev) => ({ ...prev, topic: e.target.value }))
                }
                className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-gray mb-1">
                Standard
              </label>
              <select
                value={edited.standardId || ""}
                onChange={(e) => {
                  const selected = ALL_STANDARDS.find((item) => item.id === e.target.value);
                  setEdited((prev) => ({
                    ...prev,
                    standardId: e.target.value,
                    standardLabel: selected?.label,
                    // Clear the KC so a stale assignment from the old standard
                    // is never saved against the new one.
                    kcCode: undefined,
                  }));
                }}
                className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
              >
                <option value="">Select standard</option>
                {ALL_STANDARDS.map((standard) => (
                  <option key={standard.id} value={standard.id}>
                    {standard.id} - {standard.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="question-kc-code"
                className="block text-sm font-medium text-slate-gray mb-1"
              >
                Knowledge Component
              </label>
              <select
                id="question-kc-code"
                value={edited.kcCode || ""}
                onChange={(e) => {
                  const kcCode = e.target.value || undefined;
                  setEdited((prev) => ({
                    ...prev,
                    kcCode,
                    includeInSelfPractice: kcCode
                      ? prev.includeInSelfPractice
                      : false,
                  }));
                }}
                disabled={!edited.standardId || kcsLoading}
                className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm disabled:opacity-50"
              >
                <option value="">
                  {!edited.standardId
                    ? "Select a standard first"
                    : kcsLoading
                      ? "Loading…"
                      : "Unassigned (excludes from adaptive Practice)"}
                </option>
                {availableKcs.map((kc) => (
                  <option key={kc.code} value={kc.code}>
                    {kc.code} — {kc.statement.length > 90 ? `${kc.statement.slice(0, 90)}…` : kc.statement}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-gray mb-1">
                DOK Level
              </label>
              <select
                value={edited.dok || 2}
                onChange={(e) =>
                  setEdited((prev) => ({
                    ...prev,
                    dok: parseInt(e.target.value) as DOKLevel,
                  }))
                }
                className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
              >
                <option value={1}>DOK 1 - Recall</option>
                <option value={2}>DOK 2 - Skill/Concept</option>
                <option value={3}>DOK 3 - Strategic Thinking</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-gray mb-2">
              Options
            </label>
            <div className="space-y-3">
              {edited.options.map((option) => (
                <div
                  key={option.id}
                  className={`p-3 rounded-lg border ${
                    option.id === edited.correctOptionId
                      ? "border-leaf/30 bg-leaf/5"
                      : "border-border-default"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                        option.id === edited.correctOptionId
                          ? "bg-leaf text-white"
                          : "bg-slate-gray/20 text-slate-gray"
                      }`}
                    >
                      {option.id}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="radio"
                        name="correctOption"
                        checked={option.id === edited.correctOptionId}
                        onChange={() =>
                          setEdited((prev) => ({
                            ...prev,
                            correctOptionId: option.id,
                          }))
                        }
                        className="text-leaf focus:ring-leaf/50"
                      />
                      Correct
                    </label>
                  </div>
                  <input
                    type="text"
                    value={option.text}
                    onChange={(e) =>
                      handleOptionChange(option.id, "text", e.target.value)
                    }
                    placeholder="Option text"
                    className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm mb-2"
                  />
                  <textarea
                    value={option.feedback || ""}
                    onChange={(e) =>
                      handleOptionChange(option.id, "feedback", e.target.value)
                    }
                    placeholder="Feedback for this option"
                    rows={2}
                    className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-xs resize-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-gray mb-1">
              Focus Hint
            </label>
            <input
              type="text"
              value={edited.focusHint || ""}
              onChange={(e) =>
                setEdited((prev) => ({ ...prev, focusHint: e.target.value }))
              }
              className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-gray mb-1">
              Key Knowledge
            </label>
            <textarea
              value={edited.keyKnowledge || ""}
              onChange={(e) =>
                setEdited((prev) => ({ ...prev, keyKnowledge: e.target.value }))
              }
              rows={2}
              className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-gray mb-1">
              Common Misconception
            </label>
            <textarea
              value={edited.commonMisconception || ""}
              onChange={(e) =>
                setEdited((prev) => ({
                  ...prev,
                  commonMisconception: e.target.value,
                }))
              }
              rows={2}
              className="w-full px-3 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
            />
          </div>

          <div className="rounded-lg border border-border-default p-3 sm:p-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-gray">Glossary Terms</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                These terms are shown in Practice and Review when scaffolding is unlocked.
              </p>
            </div>

            <GlossaryTermsEditor
              title="Inline Terms"
              description="Key terms that appear directly in the question stem/options."
              terms={edited.inlineTerms ?? []}
              onAdd={() => handleAddGlossaryTerm("inlineTerms")}
              onChange={(termId, field, value) =>
                handleGlossaryTermChange("inlineTerms", termId, field, value)
              }
              onRemove={(termId) => handleRemoveGlossaryTerm("inlineTerms", termId)}
            />

            <GlossaryTermsEditor
              title="Sidebar Terms"
              description="Related terms that provide extra context."
              terms={edited.sidebarTerms ?? []}
              onAdd={() => handleAddGlossaryTerm("sidebarTerms")}
              onChange={(termId, field, value) =>
                handleGlossaryTermChange("sidebarTerms", termId, field, value)
              }
              onRemove={(termId) => handleRemoveGlossaryTerm("sidebarTerms", termId)}
            />
          </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-border-subtle bg-slate-gray/5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-gray hover:bg-foreground/10 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-leaf hover:bg-leaf/90 transition-colors text-sm"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function GlossaryTermsEditor({
  title,
  description,
  terms,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  description: string;
  terms: GlossaryTerm[];
  onAdd: () => void;
  onChange: (termId: string, field: EditableGlossaryField, value: string) => void;
  onRemove: (termId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-gray">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/30 text-xs font-medium text-forest hover:bg-primary/5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add term
        </button>
      </div>

      {terms.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border-default p-2.5">
          No terms yet.
        </p>
      ) : (
        <div className="space-y-2.5">
          {terms.map((term) => (
            <div key={term.id} className="rounded-lg border border-border-default bg-surface-muted/40 p-2.5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-xs text-muted-foreground">
                  ID: <span className="font-mono">{term.id}</span>
                </p>
                <button
                  type="button"
                  onClick={() => onRemove(term.id)}
                  className="inline-flex items-center gap-1 text-xs text-error hover:text-error"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Term
                  </label>
                  <input
                    type="text"
                    value={term.term}
                    onChange={(e) => onChange(term.id, "term", e.target.value)}
                    className="w-full px-2.5 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                    placeholder="e.g. Osmosis"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Example (optional)
                  </label>
                  <input
                    type="text"
                    value={term.example ?? ""}
                    onChange={(e) => onChange(term.id, "example", e.target.value)}
                    className="w-full px-2.5 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                    placeholder="Example usage"
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Definition
                </label>
                <textarea
                  value={term.definition}
                  onChange={(e) => onChange(term.id, "definition", e.target.value)}
                  rows={2}
                  className="w-full px-2.5 py-2 border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
                  placeholder="Clear, concise definition"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
