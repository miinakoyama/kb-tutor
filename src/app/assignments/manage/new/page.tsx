"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  ExistingSetPicker,
  type QuestionSetSelection,
  type QuestionSetSummary,
} from "@/components/assignments/ExistingSetPicker";
import {
  ManualQuestionEditor,
  manualDraftToQuestion,
  validateDraft,
  type ManualQuestionDraft,
} from "@/components/assignments/ManualQuestionEditor";
import {
  ReviewScopePicker,
  type ReviewScope,
} from "@/components/assignments/ReviewScopePicker";
import { getTopicForStandard } from "@/lib/standards";
import { dateTimeLocalValueToIso } from "@/lib/due-date";

interface SchoolRow {
  id: string;
  name: string;
  member_count: number;
}

type AssignmentMode = "practice" | "exam" | "review";
type QuestionSourceType = "existing_set" | "manual";

export default function CreateAssignmentPage() {
  return (
    <Suspense
      fallback={
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      }
    >
      <CreateAssignmentContent />
    </Suspense>
  );
}

function CreateAssignmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const schoolIdFromQuery = searchParams.get("schoolId") ?? "";
  const setIdFromQuery = searchParams.get("setId") ?? "";

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [questionSets, setQuestionSets] = useState<QuestionSetSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("20");
  const [instructions, setInstructions] = useState("");
  const [mode, setMode] = useState<AssignmentMode>("practice");
  const [randomizeOrder, setRandomizeOrder] = useState(true);
  const [sourceType, setSourceType] = useState<QuestionSourceType>("existing_set");
  const [selection, setSelection] = useState<QuestionSetSelection[]>([]);
  const [manualDrafts, setManualDrafts] = useState<ManualQuestionDraft[]>([]);
  const [saveManualAsSet, setSaveManualAsSet] = useState(false);
  const [reviewScope, setReviewScope] = useState<ReviewScope>({
    standards: [],
    maxQuestions: 10,
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await fetch("/api/assignments/manage", {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          error?: string;
          schools?: SchoolRow[];
          question_sets?: QuestionSetSummary[];
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load data.");
        }
        if (cancelled) return;
        const loadedSchools = payload.schools ?? [];
        setSchools(loadedSchools);
        setQuestionSets(payload.question_sets ?? []);
        if (loadedSchools.length === 0) {
          setLoadError("You don't have any schools yet. Create a school to get started.");
        } else {
          const requested = schoolIdFromQuery
            ? loadedSchools.find((item) => item.id === schoolIdFromQuery)
            : undefined;
          setSelectedSchoolId(requested?.id ?? loadedSchools[0].id);
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Failed to load data.";
        setLoadError(message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [schoolIdFromQuery]);

  const visibleQuestionSets = useMemo(() => {
    if (!selectedSchoolId) return questionSets;
    return questionSets.filter(
      (set) =>
        set.owned_by_requester === true ||
        (set.school_ids ?? []).includes(selectedSchoolId),
    );
  }, [questionSets, selectedSchoolId]);

  const autoSelectSets = useMemo(() => {
    if (!setIdFromQuery) return undefined;
    const exists = visibleQuestionSets.some((set) => set.id === setIdFromQuery);
    if (!exists) return undefined;
    return new Set([setIdFromQuery]);
  }, [setIdFromQuery, visibleQuestionSets]);

  useEffect(() => {
    const visibleSetIds = new Set(visibleQuestionSets.map((set) => set.id));
    setSelection((current) =>
      current.filter((entry) => visibleSetIds.has(entry.setId)),
    );
  }, [visibleQuestionSets]);

  useEffect(() => {
    if (
      setIdFromQuery &&
      visibleQuestionSets.some((set) => set.id === setIdFromQuery)
    ) {
      setSourceType("existing_set");
    }
  }, [setIdFromQuery, visibleQuestionSets]);

  const totalExistingSelected = useMemo(
    () =>
      selection.reduce((sum, entry) => sum + entry.questionIds.length, 0),
    [selection],
  );

  const previewCount = useMemo(() => {
    if (mode === "review") {
      return `up to ${reviewScope.maxQuestions}`;
    }
    if (sourceType === "existing_set") {
      return `${totalExistingSelected}`;
    }
    return `${manualDrafts.length}`;
  }, [
    mode,
    reviewScope.maxQuestions,
    sourceType,
    totalExistingSelected,
    manualDrafts.length,
  ]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFormError(null);
      const cleanTitle = title.trim();
      if (!cleanTitle) {
        setFormError("Title is required.");
        return;
      }
      if (!selectedSchoolId) {
        setFormError("Please select a school.");
        return;
      }
      const targetMinutesValue = Number(targetMinutes);
      if (!Number.isFinite(targetMinutesValue) || targetMinutesValue <= 0) {
        setFormError("Target minutes must be a positive number.");
        return;
      }

      const trimmedInstructions = instructions.trim();
      const body: Record<string, unknown> = {
        title: cleanTitle,
        schoolId: selectedSchoolId,
        dueDate: dateTimeLocalValueToIso(dueDate),
        targetMinutes: targetMinutesValue,
        mode,
        randomizeOrder,
        instructions:
          trimmedInstructions.length > 0 ? trimmedInstructions : null,
      };

      if (mode === "review") {
        if (reviewScope.standards.length === 0) {
          setFormError("Select at least one standard for review scope.");
          return;
        }
        const derivedTopics = Array.from(
          new Set(
            reviewScope.standards.map((standardId) =>
              getTopicForStandard(standardId),
            ),
          ),
        );
        body.reviewScope = {
          topics: derivedTopics,
          standards: reviewScope.standards,
          maxQuestions: reviewScope.maxQuestions,
        };
      } else if (sourceType === "existing_set") {
        if (totalExistingSelected === 0) {
          setFormError("Select at least one question from the available sets.");
          return;
        }
        body.sourceType = "existing_set";
        body.selectedQuestions = selection;
      } else {
        if (manualDrafts.length === 0) {
          setFormError("Add at least one manually authored question.");
          return;
        }
        for (let i = 0; i < manualDrafts.length; i += 1) {
          const draftError = validateDraft(manualDrafts[i]);
          if (draftError) {
            setFormError(`Question ${i + 1}: ${draftError}`);
            return;
          }
        }
        body.sourceType = "manual";
        body.manualQuestions = manualDrafts.map((draft, index) =>
          manualDraftToQuestion(draft, index),
        );
        body.saveAsNewSet = saveManualAsSet;
      }

      setIsSubmitting(true);
      try {
        const response = await fetch("/api/assignments/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as {
          error?: string;
          assignmentId?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to create assignment.");
        }
        router.push("/assignments/manage");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create assignment.";
        setFormError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      title,
      selectedSchoolId,
      dueDate,
      targetMinutes,
      instructions,
      mode,
      randomizeOrder,
      reviewScope,
      sourceType,
      selection,
      totalExistingSelected,
      manualDrafts,
      saveManualAsSet,
      router,
    ],
  );

  if (isLoading) {
    return (
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <Link
        href="/assignments/manage"
        className="inline-flex items-center gap-2 text-sm text-[#14532d] hover:text-[#166534] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to assignments
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-1">
          Create Assignment
        </h1>
        <p className="text-slate-gray/70 text-sm">
          Pick existing questions, author new ones, or target previous mistakes.
        </p>
      </header>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">
          {loadError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-xl border border-[#16a34a]/25 bg-white shadow-sm p-5 space-y-4">
          <h2 className="text-lg font-semibold text-slate-gray">Basic info</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm text-slate-gray md:col-span-2">
              <span className="block mb-1 font-medium">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Genetics Quick Check"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none"
                required
              />
            </label>
            <label className="block text-sm text-slate-gray">
              <span className="block mb-1 font-medium">School</span>
              <select
                value={selectedSchoolId}
                onChange={(event) => setSelectedSchoolId(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none"
                required
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name} ({school.member_count} students)
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-gray">
              <span className="block mb-1 font-medium">Target minutes</span>
              <input
                type="number"
                min={1}
                value={targetMinutes}
                onChange={(event) => setTargetMinutes(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none"
              />
            </label>
            <label className="block text-sm text-slate-gray md:col-span-2">
              <span className="block mb-1 font-medium">
                Due date &amp; time (optional)
              </span>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none"
              />
            </label>
            <label className="block text-sm text-slate-gray md:col-span-2">
              <span className="block mb-1 font-medium">
                Instructions (optional)
              </span>
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={3}
                placeholder="e.g. Please complete Assignment 1 before starting this one."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-[#16a34a]/20 focus:border-[#16a34a] outline-none resize-y"
              />
              <span className="block mt-1 text-xs text-slate-gray/70">
                Shown to students on the assignment card. Supports multiple
                lines.
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-[#16a34a]/25 bg-white shadow-sm p-5 space-y-4">
          <h2 className="text-lg font-semibold text-slate-gray">Mode</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(
              [
                {
                  value: "practice",
                  label: "Practice",
                  description:
                    "Hints appear after misses and students can retry each question.",
                },
                {
                  value: "exam",
                  label: "Exam",
                  description:
                    "No hints, one attempt per question. Useful for assessments.",
                },
                {
                  value: "review",
                  label: "Review",
                  description:
                    "Dynamically serves questions each student previously missed.",
                },
              ] as const
            ).map((option) => {
              const isSelected = mode === option.value;
              return (
                <label
                  key={option.value}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    isSelected
                      ? "border-[#16a34a] bg-[#16a34a]/5"
                      : "border-slate-200 hover:border-[#16a34a]/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="assignment-mode"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => setMode(option.value)}
                  />
                  <p
                    className={`text-sm font-semibold ${
                      isSelected ? "text-[#14532d]" : "text-slate-gray"
                    }`}
                  >
                    {option.label}
                  </p>
                  <p className="text-xs text-slate-gray/70 mt-1">
                    {option.description}
                  </p>
                </label>
              );
            })}
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-gray cursor-pointer">
            <input
              type="checkbox"
              checked={randomizeOrder}
              onChange={(event) => setRandomizeOrder(event.target.checked)}
              className="mt-1 w-4 h-4 accent-[#16a34a]"
            />
            <span>
              <span className="block font-medium">Randomize question order</span>
              <span className="text-xs text-slate-gray/70">
                When enabled, each student sees questions in their own deterministic order.
              </span>
            </span>
          </label>
        </section>

        {mode !== "review" ? (
          <section className="rounded-xl border border-[#16a34a]/25 bg-white shadow-sm p-5 space-y-4">
            <h2 className="text-lg font-semibold text-slate-gray">Question source</h2>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer">
                <input
                  type="radio"
                  name="question-source"
                  checked={sourceType === "existing_set"}
                  onChange={() => setSourceType("existing_set")}
                />
                Select from existing sets
              </label>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer">
                <input
                  type="radio"
                  name="question-source"
                  checked={sourceType === "manual"}
                  onChange={() => setSourceType("manual")}
                />
                Write manually
              </label>
            </div>

            {sourceType === "existing_set" ? (
              visibleQuestionSets.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
                  <p className="text-sm text-slate-gray/70 mb-3">
                    No question sets are available for this school yet.
                  </p>
                  <Link
                    href="/content/mass-production"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Go to Mass Production
                  </Link>
                </div>
              ) : (
                <ExistingSetPicker
                  sets={visibleQuestionSets}
                  selection={selection}
                  onChange={setSelection}
                  initiallyExpandedSetIds={
                    autoSelectSets ? Array.from(autoSelectSets) : undefined
                  }
                  autoSelectAllOnExpand={autoSelectSets}
                />
              )
            ) : (
              <>
                <ManualQuestionEditor drafts={manualDrafts} onChange={setManualDrafts} />
                <label className="flex items-start gap-2 text-sm text-slate-gray cursor-pointer border-t border-slate-100 pt-4">
                  <input
                    type="checkbox"
                    checked={saveManualAsSet}
                    onChange={(event) => setSaveManualAsSet(event.target.checked)}
                    className="mt-1 w-4 h-4 accent-[#16a34a]"
                  />
                  <span>
                    <span className="block font-medium">
                      Save these questions as a new question set
                    </span>
                    <span className="text-xs text-slate-gray/70">
                      When enabled, a new question set named after the assignment title
                      is created so you can reuse these questions later.
                    </span>
                  </span>
                </label>
              </>
            )}
          </section>
        ) : (
          <section className="rounded-xl border border-[#16a34a]/25 bg-white shadow-sm p-5 space-y-4">
            <h2 className="text-lg font-semibold text-slate-gray">Review scope</h2>
            <ReviewScopePicker value={reviewScope} onChange={setReviewScope} />
          </section>
        )}

        <section className="rounded-xl border border-[#16a34a]/25 bg-white shadow-sm p-5 space-y-3">
          <h2 className="text-lg font-semibold text-slate-gray">Preview & submit</h2>
          <p className="text-sm text-slate-gray">
            Mode: <span className="font-semibold capitalize">{mode}</span>
            {mode !== "review" && (
              <>
                {" "}• Questions:{" "}
                <span className="font-semibold">{previewCount}</span>
              </>
            )}
            {mode === "review" && (
              <>
                {" "}• Max per student:{" "}
                <span className="font-semibold">{reviewScope.maxQuestions}</span>
              </>
            )}
            {" "}• Randomize order:{" "}
            <span className="font-semibold">
              {randomizeOrder ? "Yes" : "No"}
            </span>
          </p>

          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Link
              href="/assignments/manage"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting || schools.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? "Creating..." : "Create assignment"}
            </button>
          </div>
        </section>
      </form>
    </main>
  );
}
