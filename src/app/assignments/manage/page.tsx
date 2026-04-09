"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, ClipboardList, Plus, Trash2, X } from "lucide-react";
import { getAllStandards } from "@/lib/standards";
import type { Question } from "@/types/question";

interface ClassRow {
  id: string;
  name: string;
  member_count: number;
}

interface AssignmentRow {
  id: string;
  title: string;
  class_id: string;
  due_date: string | null;
  module_ids: number[];
  topics: string[];
  target_minutes: number;
  created_at: string;
  target_count: number;
  snapshot_count?: number;
  source_type?: "existing_set" | "generated_now" | "manual" | null;
}

interface QuestionSetRow {
  id: string;
  name: string;
  generated_at: string;
  question_count: number;
}

interface ManualDraft {
  text: string;
  topic: string;
  module: string;
  options: string[];
  correctIndex: number;
}

export default function AssignmentManagementPage() {
  const searchParams = useSearchParams();
  const classFromQuery = searchParams.get("classId") ?? "";
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [questionSets, setQuestionSets] = useState<QuestionSetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [title, setTitle] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("20");
  const [dueDate, setDueDate] = useState("");
  const [sourceType, setSourceType] = useState<"existing_set" | "generated_now" | "manual">("existing_set");
  const [selectedSetId, setSelectedSetId] = useState("");
  const [generationName, setGenerationName] = useState("");
  const [generationTopics, setGenerationTopics] = useState("Module A - Genetics");
  const [generationCount, setGenerationCount] = useState("8");
  const [manualDrafts, setManualDrafts] = useState<ManualDraft[]>([]);
  const [draftText, setDraftText] = useState("");
  const [draftTopic, setDraftTopic] = useState("Assignment");
  const [draftModule, setDraftModule] = useState("1");
  const [draftOptions, setDraftOptions] = useState(["", "", "", ""]);
  const [draftCorrectIndex, setDraftCorrectIndex] = useState(0);

  const classNameById = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const response = await fetch("/api/assignments/manage", { cache: "no-store" });
    const payload = (await response.json()) as {
      error?: string;
      classes?: ClassRow[];
      assignments?: AssignmentRow[];
      question_sets?: QuestionSetRow[];
    };
    if (!response.ok) {
      setError(payload.error ?? "Failed to load assignments.");
      setIsLoading(false);
      return;
    }
    const loadedClasses = payload.classes ?? [];
    setClasses(loadedClasses);
    setAssignments(payload.assignments ?? []);
    setQuestionSets(payload.question_sets ?? []);
    if (loadedClasses.length === 0) {
      setError("You don't have any classes yet. Create a class to get started.");
    }
    if (loadedClasses.length > 0) {
      const hasRequestedClass = classFromQuery
        ? loadedClasses.some((item) => item.id === classFromQuery)
        : false;
      if (hasRequestedClass) {
        setSelectedClassId(classFromQuery);
      } else if (!selectedClassId) {
        setSelectedClassId(loadedClasses[0].id);
      }
    }
    if (!selectedSetId && (payload.question_sets?.length ?? 0) > 0) {
      setSelectedSetId(payload.question_sets![0].id);
    }
    setIsLoading(false);
  }, [selectedClassId, selectedSetId, classFromQuery]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function resetForm() {
    setTitle("");
    setDueDate("");
    setTargetMinutes("20");
    setSourceType("existing_set");
    setGenerationName("");
    setGenerationTopics("Module A - Genetics");
    setGenerationCount("8");
    setManualDrafts([]);
    setDraftText("");
    setDraftTopic("Assignment");
    setDraftModule("1");
    setDraftOptions(["", "", "", ""]);
    setDraftCorrectIndex(0);
    if (classes.length > 0) {
      setSelectedClassId(classes[0].id);
    }
    if (questionSets.length > 0) {
      setSelectedSetId(questionSets[0].id);
    }
  }

  function addManualQuestion() {
    const text = draftText.trim();
    const topic = draftTopic.trim() || "Assignment";
    const options = draftOptions.map((option) => option.trim()).filter(Boolean);
    if (!text || options.length < 2) {
      setError("Manual question requires text and at least two options.");
      return;
    }
    const normalizedOptions = options.slice(0, 4);
    const next: ManualDraft = {
      text,
      topic,
      module: draftModule || "1",
      options: normalizedOptions,
      correctIndex: Math.min(draftCorrectIndex, normalizedOptions.length - 1),
    };
    setManualDrafts((prev) => [...prev, next]);
    setDraftText("");
    setDraftOptions(["", "", "", ""]);
    setDraftCorrectIndex(0);
  }

  function mapManualDraftsToQuestions(): Question[] {
    return manualDrafts.map((draft, index) => {
      const questionId = `manual-${Date.now()}-${index + 1}`;
      const options = draft.options.map((text, optionIndex) => ({
        id: `opt_${optionIndex + 1}`,
        text,
      }));
      const safeCorrectIndex = Math.min(draft.correctIndex, options.length - 1);
      return {
        id: questionId,
        module: Number(draft.module) || 1,
        topic: draft.topic || "Assignment",
        text: draft.text,
        imageUrl: null,
        options,
        correctOptionId: options[safeCorrectIndex]?.id ?? options[0].id,
        source: "generated",
        isVisible: true,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  async function handleCreateAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const cleanTitle = title.trim();
    if (!cleanTitle || !selectedClassId) {
      setError("Title and class are required.");
      return;
    }
    const targetMinutesValue = Number(targetMinutes);
    if (!Number.isFinite(targetMinutesValue) || targetMinutesValue <= 0) {
      setError("Target minutes must be a positive number.");
      return;
    }

    let sourcePayload:
      | { sourceType: "existing_set"; existingSetId: string }
      | { sourceType: "generated_now"; generatedQuestions: Question[] }
      | { sourceType: "manual"; manualQuestions: Question[] };

    if (sourceType === "existing_set") {
      if (!selectedSetId) {
        setError("Please select an existing question set.");
        return;
      }
      sourcePayload = { sourceType: "existing_set", existingSetId: selectedSetId };
    } else if (sourceType === "generated_now") {
      const generateCount = Number(generationCount);
      if (!generationName.trim() || !Number.isFinite(generateCount) || generateCount < 1 || generateCount > 20) {
        setError("Generation mode requires a set name and a count between 1 and 20.");
        return;
      }

      const allStandards = getAllStandards().map((item) => item.id);
      const standardCounts = Object.fromEntries(
        allStandards.map((standardId, index) => [
          standardId,
          index < generateCount ? 1 : 0,
        ]),
      );
      const response = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionSetName: generationName.trim(),
          questionCount: generateCount,
          topics: generationTopics
            .split(",")
            .map((topic) => topic.trim())
            .filter(Boolean),
          standards: allStandards,
          standardCounts,
          dokLevels: [1, 2, 3],
          includeDiagrams: false,
          diagramConfig: { chart: 0, table: 0, flowchart: 0, diagram: 0 },
          customPrompt: "",
        }),
      });
      const generatePayload = (await response.json()) as { error?: string; questions?: Question[] };
      if (!response.ok || !generatePayload.questions || generatePayload.questions.length === 0) {
        setError(generatePayload.error ?? "Failed to generate questions.");
        return;
      }
      sourcePayload = { sourceType: "generated_now", generatedQuestions: generatePayload.questions };
    } else {
      if (manualDrafts.length === 0) {
        setError("Please add at least one manual question.");
        return;
      }
      sourcePayload = {
        sourceType: "manual",
        manualQuestions: mapManualDraftsToQuestions(),
      };
    }

    setIsSubmitting(true);
    const response = await fetch("/api/assignments/manage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: cleanTitle,
        classId: selectedClassId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        targetMinutes: targetMinutesValue,
        ...sourcePayload,
      }),
    });
    const payload = (await response.json()) as {
      error?: string;
      targetCount?: number;
      questionCount?: number;
    };
    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload.error ?? "Failed to create assignment.");
      return;
    }

    setMessage(
      `Assignment created with ${payload.questionCount ?? 0} questions and auto-assigned to ${payload.targetCount ?? 0} students.`,
    );
    setShowCreateModal(false);
    resetForm();
    await loadData();
  }

  async function handleDeleteAssignment(assignmentId: string) {
    if (!confirm("Delete this assignment? This cannot be undone.")) return;
    setMessage(null);
    setError(null);
    const response = await fetch("/api/assignments/manage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assignmentId }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to delete assignment.");
      return;
    }
    setMessage("Assignment deleted.");
    setAssignments((prev) => prev.filter((item) => item.id !== assignmentId));
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-1">
            Assignment Management
          </h1>
          <p className="text-slate-gray/70 text-sm">
            Create assignments per class and automatically assign to students.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15803d] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Assignment
        </button>
      </header>

      {message && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 mb-4">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">
          {error}
        </p>
      )}

      <section className="rounded-xl border border-[#16a34a]/25 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-gray/70">Loading assignments...</div>
        ) : assignments.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-gray/70 mb-4">No assignments yet.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create your first assignment
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {assignments.map((assignment) => (
              <article key={assignment.id} className="p-4 sm:p-5 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-slate-gray truncate">
                        {assignment.title}
                      </h3>
                      <span className="flex-shrink-0 inline-flex items-center text-xs font-medium text-[#16a34a] bg-[#16a34a]/10 px-2 py-0.5 rounded-full">
                        {classNameById.get(assignment.class_id) ?? assignment.class_id}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-gray/70">
                      <span>{assignment.target_count} students</span>
                      <span>{assignment.target_minutes} min</span>
                      {assignment.source_type && (
                        <span className="capitalize">
                          Source: {assignment.source_type.replaceAll("_", " ")}
                        </span>
                      )}
                      {typeof assignment.snapshot_count === "number" && (
                        <span>{assignment.snapshot_count} questions</span>
                      )}
                      {assignment.topics.length > 0 && (
                        <span className="truncate max-w-[200px]">{assignment.topics.join(", ")}</span>
                      )}
                      {assignment.due_date && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="w-3.5 h-3.5" />
                          Due {new Date(assignment.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => void handleDeleteAssignment(assignment.id)}
                    className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete assignment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-gray">Create Assignment</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form className="p-5 space-y-4" onSubmit={handleCreateAssignment}>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                  placeholder="e.g. Genetics Quick Check"
                  required
                />
              </label>
              <label className="block text-sm text-slate-gray">
                <span className="block mb-1 font-medium">Class</span>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                  required
                >
                  <option value="">Select class</option>
                  {classes.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>
                      {classItem.name} ({classItem.member_count} students)
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-gray mb-2">Question Source</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="source-type"
                      checked={sourceType === "existing_set"}
                      onChange={() => setSourceType("existing_set")}
                    />
                    Existing set
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="source-type"
                      checked={sourceType === "generated_now"}
                      onChange={() => setSourceType("generated_now")}
                    />
                    Generate now
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="source-type"
                      checked={sourceType === "manual"}
                      onChange={() => setSourceType("manual")}
                    />
                    Manual input
                  </label>
                </div>

                {sourceType === "existing_set" && (
                  <label className="block text-sm text-slate-gray mt-3">
                    <span className="block mb-1 font-medium">Question set</span>
                    <select
                      value={selectedSetId}
                      onChange={(e) => setSelectedSetId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      required
                    >
                      <option value="">Select question set</option>
                      {questionSets.map((set) => (
                        <option key={set.id} value={set.id}>
                          {set.name} ({set.question_count} questions)
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {sourceType === "generated_now" && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block text-sm text-slate-gray">
                      <span className="block mb-1 font-medium">Set name</span>
                      <input
                        value={generationName}
                        onChange={(e) => setGenerationName(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                        placeholder="e.g. Genetics Class Quiz"
                      />
                    </label>
                    <label className="block text-sm text-slate-gray">
                      <span className="block mb-1 font-medium">Question count (1-20)</span>
                      <input
                        type="number"
                        value={generationCount}
                        onChange={(e) => setGenerationCount(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                        min={1}
                        max={20}
                      />
                    </label>
                    <label className="block text-sm text-slate-gray md:col-span-2">
                      <span className="block mb-1 font-medium">Topics (comma separated)</span>
                      <input
                        value={generationTopics}
                        onChange={(e) => setGenerationTopics(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                        placeholder="Module A - Genetics, Module B - Ecology"
                      />
                    </label>
                  </div>
                )}

                {sourceType === "manual" && (
                  <div className="mt-3 space-y-3">
                    <label className="block text-sm text-slate-gray">
                      <span className="block mb-1 font-medium">Question text</span>
                      <textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                        rows={3}
                      />
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="block text-sm text-slate-gray">
                        <span className="block mb-1 font-medium">Topic</span>
                        <input
                          value={draftTopic}
                          onChange={(e) => setDraftTopic(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2"
                        />
                      </label>
                      <label className="block text-sm text-slate-gray">
                        <span className="block mb-1 font-medium">Module</span>
                        <input
                          type="number"
                          min={1}
                          value={draftModule}
                          onChange={(e) => setDraftModule(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {draftOptions.map((option, index) => (
                        <label key={index} className="block text-sm text-slate-gray">
                          <span className="block mb-1 font-medium">Option {index + 1}</span>
                          <input
                            value={option}
                            onChange={(e) =>
                              setDraftOptions((prev) =>
                                prev.map((item, optionIndex) =>
                                  optionIndex === index ? e.target.value : item,
                                ),
                              )
                            }
                            className="w-full rounded-lg border border-slate-200 px-3 py-2"
                          />
                        </label>
                      ))}
                    </div>
                    <label className="block text-sm text-slate-gray">
                      <span className="block mb-1 font-medium">Correct option</span>
                      <select
                        value={draftCorrectIndex}
                        onChange={(e) => setDraftCorrectIndex(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <option value={0}>Option 1</option>
                        <option value={1}>Option 2</option>
                        <option value={2}>Option 3</option>
                        <option value={3}>Option 4</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={addManualQuestion}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Add question
                    </button>
                    <p className="text-xs text-slate-gray/60">
                      Added manual questions: {manualDrafts.length}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm text-slate-gray">
                  <span className="block mb-1 font-medium">Target Minutes</span>
                  <input
                    value={targetMinutes}
                    onChange={(e) => setTargetMinutes(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                    type="number"
                    min={1}
                  />
                </label>
                <label className="block text-sm text-slate-gray">
                  <span className="block mb-1 font-medium">Due Date (optional)</span>
                  <input
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none transition-colors"
                    type="date"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || classes.length === 0}
                  className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

