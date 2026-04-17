"use client";

import { useState, useEffect } from "react";
import { X, Save, Plus, Trash2 } from "lucide-react";
import type { Question, DOKLevel, GlossaryTerm } from "@/types/question";
import { getAllStandards } from "@/lib/standards";
import { normalizeGlossaryTerms } from "@/lib/glossary";

const ALL_STANDARDS = getAllStandards();
type GlossaryListKey = "inlineTerms" | "sidebarTerms";
type EditableGlossaryField = "term" | "definition" | "example";

function getGlossaryTerms(question: Question, listKey: GlossaryListKey): GlossaryTerm[] {
  return [...(question[listKey] ?? [])];
}

function createNewGlossaryTerm(listKey: GlossaryListKey, index: number): GlossaryTerm {
  const prefix = listKey === "inlineTerms" ? "inline" : "sidebar";
  const seed = Math.floor(Math.random() * 1000);
  return {
    id: `${prefix}-${Date.now()}-${index + 1}-${seed}`,
    term: "",
    definition: "",
    example: "",
  };
}

function dedupeSidebarTerms(
  inlineTerms: GlossaryTerm[] | undefined,
  sidebarTerms: GlossaryTerm[] | undefined,
): GlossaryTerm[] {
  const inlineIds = new Set((inlineTerms ?? []).map((term) => term.id));
  const inlineLabels = new Set(
    (inlineTerms ?? []).map((term) => term.term.toLowerCase()),
  );
  return (sidebarTerms ?? []).filter((term) => {
    if (inlineIds.has(term.id)) return false;
    if (inlineLabels.has(term.term.toLowerCase())) return false;
    return true;
  });
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

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

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

  const handleSave = () => {
    const inlineTerms = normalizeGlossaryTerms(
      edited.inlineTerms,
      `${edited.id}-inline`,
    );
    const sidebarTermsRaw = normalizeGlossaryTerms(
      edited.sidebarTerms,
      `${edited.id}-sidebar`,
    );
    const sidebarTerms = dedupeSidebarTerms(inlineTerms, sidebarTermsRaw);
    onSave({
      ...edited,
      inlineTerms,
      sidebarTerms: sidebarTerms.length > 0 ? sidebarTerms : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 pt-4 sm:pt-4 bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] sm:max-h-[90vh] overflow-hidden flex flex-col my-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-gray/10">
          <h2 className="text-lg font-semibold text-slate-gray">Edit Question</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-gray/50 hover:text-slate-gray hover:bg-slate-gray/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-gray mb-1">
              Question Text
            </label>
            <textarea
              value={edited.text}
              onChange={(e) => setEdited((prev) => ({ ...prev, text: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
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
                className="w-full px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
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
                  }));
                }}
                className="w-full px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
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
                className="w-full px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
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
                      : "border-slate-gray/20"
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
                    <label className="flex items-center gap-2 text-xs text-slate-gray/60">
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
                    className="w-full px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm mb-2"
                  />
                  <textarea
                    value={option.feedback || ""}
                    onChange={(e) =>
                      handleOptionChange(option.id, "feedback", e.target.value)
                    }
                    placeholder="Feedback for this option"
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-xs resize-none"
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
              className="w-full px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
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
              className="w-full px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
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
              className="w-full px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
            />
          </div>

          <div className="rounded-lg border border-slate-gray/20 p-3 sm:p-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-gray">Glossary Terms</p>
              <p className="text-xs text-slate-gray/60 mt-0.5">
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
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-gray/10 bg-slate-gray/5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-gray hover:bg-slate-gray/10 transition-colors text-sm"
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
          <p className="text-xs text-slate-gray/60">{description}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#16a34a]/30 text-xs font-medium text-[#166534] hover:bg-[#16a34a]/5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add term
        </button>
      </div>

      {terms.length === 0 ? (
        <p className="text-xs text-slate-gray/60 rounded-lg border border-dashed border-slate-gray/30 p-2.5">
          No terms yet.
        </p>
      ) : (
        <div className="space-y-2.5">
          {terms.map((term) => (
            <div key={term.id} className="rounded-lg border border-slate-gray/20 bg-slate-50/40 p-2.5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-xs text-slate-gray/50">
                  ID: <span className="font-mono">{term.id}</span>
                </p>
                <button
                  type="button"
                  onClick={() => onRemove(term.id)}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-gray/70 mb-1">
                    Term
                  </label>
                  <input
                    type="text"
                    value={term.term}
                    onChange={(e) => onChange(term.id, "term", e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                    placeholder="e.g. Osmosis"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-gray/70 mb-1">
                    Example (optional)
                  </label>
                  <input
                    type="text"
                    value={term.example ?? ""}
                    onChange={(e) => onChange(term.id, "example", e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm"
                    placeholder="Example usage"
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="block text-xs font-medium text-slate-gray/70 mb-1">
                  Definition
                </label>
                <textarea
                  value={term.definition}
                  onChange={(e) => onChange(term.id, "definition", e.target.value)}
                  rows={2}
                  className="w-full px-2.5 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-leaf/50 text-sm resize-none"
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
