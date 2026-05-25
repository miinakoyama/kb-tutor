"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, CalendarDays, ClipboardList, List, Plus, Trash2, Users } from "lucide-react";
import { AssignmentProgressPanel } from "@/components/assignments/AssignmentProgressPanel";
import { formatDueDateTime } from "@/lib/due-date";
import type { AssignmentProgressResponse } from "@/lib/analytics/assignment-progress";

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
  snapshot_count?: number;
  source_type?: "existing_set" | "generated_now" | "manual" | null;
  mode?: AssignmentMode | null;
  randomize_order?: boolean | null;
  max_questions?: number | null;
  max_attempts?: number | null;
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

type ManageTab = "list" | "progress";

function AssignmentManagementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: ManageTab =
    searchParams.get("tab") === "progress" ? "progress" : "list";

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressData, setProgressData] = useState<AssignmentProgressResponse>({
    assignments: [],
    rows: [],
  });
  const [isProgressLoading, setIsProgressLoading] = useState(false);
  const [progressSchoolId, setProgressSchoolId] = useState<string>("");
  const [progressError, setProgressError] = useState<string | null>(null);

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

  useEffect(() => {
    if (tab !== "progress") return;
    const ac = new AbortController();
    const load = async () => {
      setIsProgressLoading(true);
      setProgressError(null);
      setProgressData({ assignments: [], rows: [] });
      const params = new URLSearchParams();
      if (progressSchoolId) params.set("classId", progressSchoolId);
      try {
        const response = await fetch(
          `/api/teacher-dashboard/assignment-progress?${params.toString()}`,
          { cache: "no-store", signal: ac.signal },
        );
        let json: unknown;
        try {
          json = await response.json();
        } catch {
          if (!ac.signal.aborted) {
            setProgressData({ assignments: [], rows: [] });
            setProgressError("Failed to read assignment progress.");
          }
          return;
        }
        if (ac.signal.aborted) return;
        if (!response.ok) {
          const err =
            typeof json === "object" &&
            json !== null &&
            "error" in json &&
            typeof (json as { error: unknown }).error === "string"
              ? (json as { error: string }).error
              : "Failed to load assignment progress.";
          setProgressData({ assignments: [], rows: [] });
          setProgressError(err);
          return;
        }
        setProgressData(json as AssignmentProgressResponse);
      } catch (e) {
        if (ac.signal.aborted) return;
        const isAbort =
          (typeof DOMException !== "undefined" &&
            e instanceof DOMException &&
            e.name === "AbortError") ||
          (e instanceof Error && e.name === "AbortError");
        if (isAbort) return;
        setProgressData({ assignments: [], rows: [] });
        setProgressError(
          e instanceof Error ? e.message : "Failed to load assignment progress.",
        );
      } finally {
        if (!ac.signal.aborted) {
          setIsProgressLoading(false);
        }
      }
    };
    void load();
    return () => ac.abort();
  }, [tab, progressSchoolId]);

  function setTab(next: ManageTab) {
    const p = new URLSearchParams(searchParams.toString());
    if (next === "progress") {
      p.set("tab", "progress");
    } else {
      p.delete("tab");
    }
    const q = p.toString();
    router.replace(q ? `/assignments/manage?${q}` : "/assignments/manage", {
      scroll: false,
    });
  }

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
    // Intentionally no student count here: every school member is
    // automatically assigned, so the count is just the school's roster size
    // (already implied by the school badge). Showing it in the list only
    // invited confusion after students joined the school later.
    const parts: string[] = [];
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
    if (typeof assignment.max_attempts === "number") {
      parts.push(`Max ${assignment.max_attempts} attempt${assignment.max_attempts === 1 ? "" : "s"}`);
    }
    return parts;
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading mb-1">
            Assignment Management
          </h1>
          <p className="text-muted-foreground text-sm">
            Create assignments per school and automatically assign to students.
          </p>
        </div>
        <Link
          href="/assignments/manage/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition-colors shadow-sm"
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
        <p className="rounded-lg border border-error-border bg-error-light px-3 py-2 text-sm text-error mb-4">
          {error}
        </p>
      )}

      <div
        className="mb-6 flex items-center gap-4 overflow-x-auto border-b border-border-default"
        role="tablist"
        aria-label="Assignment management sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "list"}
          onClick={() => setTab("list")}
          className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-1.5 pb-2.5 pt-1 text-sm font-semibold transition-colors ${
            tab === "list"
              ? "border-primary text-heading"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <List className="h-4 w-4" />
          Assignment list
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "progress"}
          onClick={() => setTab("progress")}
          className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-1.5 pb-2.5 pt-1 text-sm font-semibold transition-colors ${
            tab === "progress"
              ? "border-primary text-heading"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Assignment progress
        </button>
      </div>

      {tab === "list" ? (
        <section className="rounded-xl border border-primary/25 bg-surface shadow-sm">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Loading assignments...
            </div>
          ) : assignments.length === 0 ? (
            <div className="p-8 text-center">
              <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">No assignments yet.</p>
              <Link
                href="/assignments/manage/new"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
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
                    className="group p-4 sm:p-5 hover:bg-surface-muted/80 transition-colors cursor-pointer"
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
                          <h3 className="text-base font-semibold text-slate-gray truncate group-hover:text-heading">
                            {assignment.title}
                          </h3>
                          <span className="flex-shrink-0 inline-flex items-center text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
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
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          {describeAssignment(assignment).map((part, index) => (
                            <span key={index}>{part}</span>
                          ))}
                          {assignment.due_date && (
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="w-3.5 h-3.5" />
                              Due {formatDueDateTime(assignment.due_date)}
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
                        className="flex-shrink-0 p-2 rounded-lg text-muted-foreground hover:text-error hover:bg-error-light transition-colors"
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
      ) : (
        <div className="space-y-4">
          {schools.length > 1 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-sm text-slate-gray">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  School
                </span>
                <select
                  value={progressSchoolId}
                  onChange={(e) => setProgressSchoolId(e.target.value)}
                  className="w-full min-w-[12rem] rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-slate-gray focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:w-auto"
                >
                  <option value="">All your schools</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <AssignmentProgressPanel
            data={progressData}
            isLoading={isProgressLoading}
            className="mt-0"
            errorMessage={progressError}
          />
        </div>
      )}
    </main>
  );
}
