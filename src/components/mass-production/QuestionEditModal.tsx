"use client";

import { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import type { Question, DOKLevel } from "@/types/question";
import { getAllStandards } from "@/lib/standards";

const ALL_STANDARDS = getAllStandards();

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

  const handleSave = () => {
    onSave(edited);
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
