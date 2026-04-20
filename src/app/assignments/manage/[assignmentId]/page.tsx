"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Info,
  Loader2,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import type { Question } from "@/types/question";
import { QuestionDetails } from "@/components/assignments/QuestionDetails";
import {
  dateTimeLocalValueToIso,
  formatDueDateTime,
  isoToDateTimeLocalValue,
} from "@/lib/due-date";

type AssignmentMode = "practice" | "exam" | "review";
type SourceType = "existing_set" | "generated_now" | "manual";

interface AssignmentDetail {
  id: string;
  title: string;
  school_id: string;
  school_name: string | null;
  due_date: string | null;
  module_ids: number[] | null;
  topics: string[] | null;
  target_minutes: number;
  created_at: string;
  created_by: string;
  mode: AssignmentMode | null;
  randomize_order: boolean | null;
  max_questions: number | null;
  review_topics: string[] | null;
  review_standards: string[] | null;
}

interface SnapshotEntry {
  orderIndex: number;
  questionId: string;
  sourceType: SourceType;
  payload: Question;
}

interface DetailPayload {
  assignment: AssignmentDetail;
  questions: SnapshotEntry[];
  source_type: SourceType | null;
  targets: { total: number; student_ids: string[] };
  attempts: { total: number; respondents: number; correct: number };
}

export default function AssignmentDetailPage() {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();
  const assignmentId = params.assignmentId;

  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/assignments/manage/${assignmentId}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as Partial<DetailPayload> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load assignment.");
      }
      setDetail(payload as DetailPayload);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load assignment.");
    } finally {
      setIsLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (isLoading) {
    return (
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 text-center text-slate-gray/70">
        <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
        Loading assignment...
      </main>
    );
  }

  if (loadError || !detail) {
    return (
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <Link
          href="/assignments/manage"
          className="inline-flex items-center gap-1 text-sm text-slate-gray/70 hover:text-[#16a34a] mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to assignments
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError ?? "Assignment not found."}
        </div>
      </main>
    );
  }

  return (
    <AssignmentDetailContent
      assignmentId={assignmentId}
      initial={detail}
      message={message}
      setMessage={setMessage}
      router={router}
      reload={loadDetail}
    />
  );
}

type RouterLike = ReturnType<typeof useRouter>;

function AssignmentDetailContent({
  assignmentId,
  initial,
  message,
  setMessage,
  router,
  reload,
}: {
  assignmentId: string;
  initial: DetailPayload;
  message: string | null;
  setMessage: (value: string | null) => void;
  router: RouterLike;
  reload: () => Promise<void>;
}) {
  const assignment = initial.assignment;
  const mode = (assignment.mode ?? "practice") as AssignmentMode;
  const attemptCount = initial.attempts.total;
  const respondentCount = initial.attempts.respondents;

  // --- Safe-field form state ---
  const [title, setTitle] = useState(assignment.title);
  // Keep local form state as `YYYY-MM-DDTHH:mm` (datetime-local format) so
  // it round-trips cleanly with the input. Convert back to ISO on save.
  const [dueDate, setDueDate] = useState(
    isoToDateTimeLocalValue(assignment.due_date),
  );
  const [targetMinutes, setTargetMinutes] = useState(assignment.target_minutes);
  const [randomizeOrder, setRandomizeOrder] = useState(
    assignment.randomize_order !== false,
  );
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const metaDirty = useMemo(() => {
    // Compare normalized ISO strings so clock-skew/precision differences
    // (datetime-local has minute precision, DB stores down to ms) don't
    // register as edits when the user didn't touch the input.
    const formIso = dateTimeLocalValueToIso(dueDate);
    const storedIso = assignment.due_date
      ? new Date(assignment.due_date).toISOString()
      : null;
    return (
      title.trim() !== assignment.title ||
      formIso !== storedIso ||
      Number(targetMinutes) !== assignment.target_minutes ||
      randomizeOrder !== (assignment.randomize_order !== false)
    );
  }, [title, dueDate, targetMinutes, randomizeOrder, assignment]);

  const saveMeta = async () => {
    setMetaSaving(true);
    setMetaError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/assignments/manage/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          dueDate: dateTimeLocalValueToIso(dueDate),
          targetMinutes,
          randomizeOrder,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update assignment.");
      }
      setMessage("Assignment updated.");
      await reload();
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setMetaSaving(false);
    }
  };

  const handleDelete = async () => {
    const warningLines = [`Delete "${assignment.title}"?`];
    if (attemptCount > 0) {
      warningLines.push(
        `${respondentCount} student${respondentCount === 1 ? "" : "s"} have already answered (${attemptCount} attempts).`,
        "The assignment will be removed and students will no longer see it, but answer records will be preserved.",
      );
    } else {
      warningLines.push("No attempts yet.");
    }
    warningLines.push("This cannot be undone.");
    if (!confirm(warningLines.join("\n\n"))) return;

    const response = await fetch(`/api/assignments/manage`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assignmentId }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMetaError(payload.error ?? "Failed to delete assignment.");
      return;
    }
    router.push("/assignments/manage");
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-10 space-y-6">
      <Link
        href="/assignments/manage"
        className="inline-flex items-center gap-1 text-sm text-slate-gray/70 hover:text-[#16a34a]"
      >
        <ArrowLeft className="w-4 h-4" /> Back to assignments
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] truncate">
              {assignment.title}
            </h1>
            {assignment.school_name && (
              <span className="inline-flex items-center text-xs font-medium text-[#16a34a] bg-[#16a34a]/10 px-2 py-0.5 rounded-full">
                {assignment.school_name}
              </span>
            )}
            <span className="inline-flex items-center text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
              Mode: {mode}
            </span>
          </div>
          <p className="text-xs text-slate-gray/60">
            Created {new Date(assignment.created_at).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => void handleDelete()}
          className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg text-red-600 border border-red-200 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </header>

      {message && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {message}
        </p>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">What can be edited</p>
          <p className="text-slate-600">
            Title, due date, time limit, and randomization can always be updated.
            Questions, mode, and review scope are fixed after creation to protect
            in-progress students — delete and recreate to change them.
          </p>
        </div>
      </div>

      {/* ---- Stats ---- */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Students assigned"
          value={initial.targets.total}
          icon={<Users className="w-4 h-4" />}
        />
        <StatCard
          label="Students who answered"
          value={respondentCount}
          icon={<Users className="w-4 h-4" />}
          highlight={respondentCount > 0}
        />
        <StatCard
          label={mode === "review" ? "Max questions" : "Questions in set"}
          value={
            mode === "review"
              ? (assignment.max_questions ?? 0)
              : initial.questions.length
          }
          icon={<ClipboardList className="w-4 h-4" />}
        />
      </section>

      {/* ---- Safe-field editor ---- */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-gray">Details</h2>
          <span className="text-xs text-slate-gray/60">(editable)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Title</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Due date &amp; time</span>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Target minutes</span>
            <input
              type="number"
              min={1}
              max={180}
              value={targetMinutes}
              onChange={(event) =>
                setTargetMinutes(
                  Math.max(1, Math.min(180, Number(event.target.value) || 1)),
                )
              }
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-start gap-2 text-sm text-slate-gray pt-6">
            <input
              type="checkbox"
              checked={randomizeOrder}
              onChange={(event) => setRandomizeOrder(event.target.checked)}
              className="mt-1 w-4 h-4 accent-[#16a34a]"
            />
            <span>
              <span className="block font-medium">Randomize question order</span>
              <span className="text-xs text-slate-gray/70">
                Each student sees questions in a different deterministic order.
              </span>
            </span>
          </label>
        </div>

        {metaError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {metaError}
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={() => void saveMeta()}
            disabled={!metaDirty || metaSaving}
            className="inline-flex items-center gap-1 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {metaSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save changes
          </button>
        </div>
      </section>

      {/* ---- Content display (read-only) ---- */}
      {mode === "review" ? (
        <ReviewScopeDisplay assignment={assignment} />
      ) : (
        <QuestionsDisplay
          questions={initial.questions}
          sourceType={initial.source_type}
        />
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        highlight
          ? "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-slate-gray/70 mb-1">
        {icon}
        {label}
      </div>
      <p
        className={`text-2xl font-semibold ${
          highlight ? "text-amber-700" : "text-slate-gray"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/* ---------------------------------- Questions list (read-only) ---------------------------------- */

function QuestionsDisplay({
  questions,
  sourceType,
}: {
  questions: SnapshotEntry[];
  sourceType: SourceType | null;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-base font-semibold text-slate-gray">Questions</h2>
        <span className="text-xs text-slate-gray/60">
          {questions.length} question{questions.length === 1 ? "" : "s"}
        </span>
        {sourceType && (
          <span className="text-xs text-slate-gray/60">
            Source: {sourceType.replaceAll("_", " ")}
          </span>
        )}
      </div>

      {questions.length === 0 ? (
        <p className="text-sm text-slate-gray/70">
          No questions attached to this assignment.
        </p>
      ) : (
        <ul className="space-y-2">
          {questions.map((entry) => {
            const showDetails = expandedIds.has(entry.questionId);
            return (
              <li
                key={entry.questionId}
                className="rounded-md border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggleExpanded(entry.questionId)}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 rounded-md"
                >
                  {showDetails ? (
                    <ChevronDown className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-gray">
                      <span className="text-slate-gray/50 mr-1">
                        Q{entry.orderIndex + 1}.
                      </span>
                      {entry.payload.text}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-gray/60">
                      {entry.payload.topic}
                      {entry.payload.standardId
                        ? ` • ${entry.payload.standardId}`
                        : ""}
                    </p>
                  </div>
                </button>
                {showDetails && <QuestionDetails question={entry.payload} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------- Review scope (read-only) ---------------------------------- */

function ReviewScopeDisplay({ assignment }: { assignment: AssignmentDetail }) {
  const standards = assignment.review_standards ?? [];
  const topics = assignment.review_topics ?? [];
  const maxQuestions = assignment.max_questions ?? 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <h2 className="text-base font-semibold text-slate-gray">Review scope</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/70 mb-1.5">
            Max questions per student
          </p>
          <p className="text-slate-gray">{maxQuestions}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/70 mb-1.5">
            Topics ({topics.length})
          </p>
          <p className="text-slate-gray">
            {topics.length > 0 ? topics.join(", ") : "—"}
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/70 mb-1.5">
          Standards ({standards.length})
        </p>
        {standards.length === 0 ? (
          <p className="text-xs text-slate-gray/70">No standards selected.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {standards.map((s) => (
              <li
                key={s}
                className="inline-flex items-center text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5"
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>

      {assignment.due_date && (
        <p className="inline-flex items-center gap-1 text-xs text-slate-gray/70">
          <CalendarDays className="w-3.5 h-3.5" />
          Due {formatDueDateTime(assignment.due_date)}
        </p>
      )}
    </section>
  );
}
