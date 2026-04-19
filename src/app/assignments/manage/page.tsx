"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ClipboardList, Plus, Trash2, Users } from "lucide-react";

interface SchoolRow {
  id: string;
  name: string;
  member_count: number;
}

type AssignmentMode = "practice" | "exam" | "review";

interface AssignmentRow {
  id: string;
  title: string;
  school_id: string;
  due_date: string | null;
  module_ids: number[];
  topics: string[];
  target_minutes: number;
  created_at: string;
  target_count: number;
  snapshot_count?: number;
  source_type?: "existing_set" | "generated_now" | "manual" | null;
  mode?: AssignmentMode | null;
  randomize_order?: boolean | null;
  max_questions?: number | null;
  review_topics?: string[] | null;
  review_standards?: string[] | null;
  attempt_count?: number;
  respondent_count?: number;
}

export default function AssignmentManagementPage() {
  return (
    <Suspense>
      <AssignmentManagementContent />
    </Suspense>
  );
}

function AssignmentManagementContent() {
  const router = useRouter();
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const schoolNameById = useMemo(
    () => new Map(schools.map((item) => [item.id, item.name])),
    [schools],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/assignments/manage", { cache: "no-store" });
      const payload = (await response.json()) as {
        error?: string;
        schools?: SchoolRow[];
        assignments?: AssignmentRow[];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load assignments.");
      }
      const loadedSchools = payload.schools ?? [];
      setSchools(loadedSchools);
      setAssignments(payload.assignments ?? []);
      if (loadedSchools.length === 0) {
        setError("You don't have any schools yet. Create a school to get started.");
      }
    } catch (loadError) {
      const messageText =
        loadError instanceof Error ? loadError.message : "Failed to load assignments.";
      setError(messageText);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleDeleteAssignment(assignment: AssignmentRow) {
    const attemptCount = assignment.attempt_count ?? 0;
    const respondentCount = assignment.respondent_count ?? 0;
    const warningLines = [`Delete "${assignment.title}"?`];
    if (attemptCount > 0) {
      warningLines.push(
        `${respondentCount} student${respondentCount === 1 ? "" : "s"} have already answered (${attemptCount} attempts).`,
        "The assignment will be removed and students will no longer see it, but historical answer records will be preserved (detached from the assignment).",
      );
    } else {
      warningLines.push("No attempts yet.");
    }
    warningLines.push("This cannot be undone.");
    if (!confirm(warningLines.join("\n\n"))) return;

    setMessage(null);
    setError(null);
    const response = await fetch("/api/assignments/manage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: assignment.id }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Failed to delete assignment.");
      return;
    }
    setMessage("Assignment deleted.");
    setAssignments((prev) => prev.filter((item) => item.id !== assignment.id));
  }

  function describeAssignment(assignment: AssignmentRow): string[] {
    const parts: string[] = [];
    parts.push(`${assignment.target_count} students`);
    parts.push(`${assignment.target_minutes} min`);
    const modeLabel = (assignment.mode ?? "practice").toString();
    parts.push(`Mode: ${modeLabel}`);
    if (modeLabel === "review") {
      if (assignment.max_questions) {
        parts.push(`Max ${assignment.max_questions} questions`);
      }
    } else if (typeof assignment.snapshot_count === "number") {
      parts.push(`${assignment.snapshot_count} questions`);
    }
    if (assignment.source_type) {
      parts.push(`Source: ${assignment.source_type.replaceAll("_", " ")}`);
    }
    if (assignment.randomize_order !== false) {
      parts.push("Random order");
    }
    return parts;
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-1">
            Assignment Management
          </h1>
          <p className="text-slate-gray/70 text-sm">
            Create assignments per school and automatically assign to students.
          </p>
        </div>
        <Link
          href="/assignments/manage/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15803d] transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Create Assignment
        </Link>
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
          <div className="p-8 text-center text-sm text-slate-gray/70">
            Loading assignments...
          </div>
        ) : assignments.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-gray/70 mb-4">No assignments yet.</p>
            <Link
              href="/assignments/manage/new"
              className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create your first assignment
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {assignments.map((assignment) => {
              const attemptCount = assignment.attempt_count ?? 0;
              const respondentCount = assignment.respondent_count ?? 0;
              return (
                <article
                  key={assignment.id}
                  className="group p-4 sm:p-5 hover:bg-slate-50/80 transition-colors cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    router.push(`/assignments/manage/${assignment.id}`)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/assignments/manage/${assignment.id}`);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-base font-semibold text-slate-gray truncate group-hover:text-[#14532d]">
                          {assignment.title}
                        </h3>
                        <span className="flex-shrink-0 inline-flex items-center text-xs font-medium text-[#16a34a] bg-[#16a34a]/10 px-2 py-0.5 rounded-full">
                          {schoolNameById.get(assignment.school_id) ?? assignment.school_id}
                        </span>
                        {attemptCount > 0 && (
                          <span
                            className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"
                            title={`${respondentCount} students answered, ${attemptCount} attempts`}
                          >
                            <Users className="w-3 h-3" />
                            {respondentCount} answered
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-gray/70">
                        {describeAssignment(assignment).map((part, index) => (
                          <span key={index}>{part}</span>
                        ))}
                        {assignment.topics.length > 0 && (
                          <span className="truncate max-w-[240px]">
                            {assignment.topics.join(", ")}
                          </span>
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
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteAssignment(assignment);
                      }}
                      className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete assignment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
