"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, CalendarDays, ClipboardList, List, Plus, Trash2 } from "lucide-react";
import { AssignmentProgressPanel } from "@/components/assignments/AssignmentProgressPanel";
import { formatDueDateTime } from "@/lib/due-date";
import type { AssignmentProgressResponse } from "@/lib/analytics/assignment-progress";
import { alertSuccess } from "@/lib/ui/status-badge-styles";

const GEIST = "var(--font-geist), ui-sans-serif, sans-serif";

/** Card recipe from the design system: glass surface + hairline + shadow. */
const CARD_STYLE: React.CSSProperties = {
  background: "var(--assignment-glass-bg-strong)",
  border: "1px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-card-shadow)",
};

/** Primary pill CTA (design-system hero CTA). */
const PRIMARY_BTN_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold transition duration-200 hover:brightness-110 active:brightness-95 disabled:opacity-50";
const PRIMARY_BTN_STYLE: React.CSSProperties = {
  color: "var(--assignment-cta-text)",
  background: "var(--assignment-cta-bg-strong)",
  border: "1.5px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-cta-elevated-shadow)",
  fontFamily: GEIST,
};

/** Tightened frosted-bead shadow: inset top gloss + a narrow drop. */
const PILL_SHADOW =
  "inset 0 1px 1px rgba(255,255,255,0.55), 0 1px 3px rgba(31,45,31,0.12)";
const PILL_BLUR = "blur(10px) saturate(140%)";

/** Light-green frosted-glass bead (e.g. the school tag). */
const GREEN_PILL_STYLE: React.CSSProperties = {
  color: "var(--assignment-completed)",
  background:
    "linear-gradient(180deg, rgba(127,184,157,0.32) 0%, rgba(127,184,157,0.16) 100%)",
  border: "1px solid rgba(127,184,157,0.55)",
  boxShadow: PILL_SHADOW,
  backdropFilter: PILL_BLUR,
  WebkitBackdropFilter: PILL_BLUR,
};

/** Yellow frosted-glass bead (e.g. the answered count). */
const YELLOW_PILL_STYLE: React.CSSProperties = {
  color: "var(--assignment-mode-review)",
  background:
    "linear-gradient(180deg, rgba(248,223,160,0.6) 0%, rgba(248,223,160,0.32) 100%)",
  border: "1px solid rgba(248,223,160,0.9)",
  boxShadow: PILL_SHADOW,
  backdropFilter: PILL_BLUR,
  WebkitBackdropFilter: PILL_BLUR,
};

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
    <main
      className="mx-auto w-full px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12"
      style={{ maxWidth: 1500 }}
    >
      <header className="mb-10 flex items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold text-heading sm:text-3xl">
          Assignment Management
        </h1>
        <Link
          href="/assignments/manage/new"
          className={`${PRIMARY_BTN_CLASS} h-12 flex-shrink-0 gap-2.5 px-6 text-base`}
          style={PRIMARY_BTN_STYLE}
        >
          <Plus className="h-5 w-5" />
          Create Assignment
        </Link>
      </header>

      {message && (
        <p className={`${alertSuccess} mb-6`}>
          {message}
        </p>
      )}
      {error && (
        <p className="mb-6 rounded-xl border border-error-border bg-error-light px-3.5 py-2.5 text-sm text-error">
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
              ? "border-[var(--assignment-completed)] text-[var(--assignment-completed)]"
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
              ? "border-[var(--assignment-completed)] text-[var(--assignment-completed)]"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Assignment progress
        </button>
      </div>

      {tab === "list" ? (
        <section className="overflow-hidden rounded-2xl" style={CARD_STYLE}>
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Loading assignments...
            </div>
          ) : assignments.length === 0 ? (
            <div className="p-8 text-center">
              <ClipboardList className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
              <p className="mb-4 text-muted-foreground">No assignments yet.</p>
              <Link
                href="/assignments/manage/new"
                className={`${PRIMARY_BTN_CLASS} px-5 py-2.5 text-sm`}
                style={PRIMARY_BTN_STYLE}
              >
                <Plus className="h-4 w-4" />
                Create your first assignment
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
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
                          <h3 className="truncate font-heading text-base font-semibold text-slate-gray tracking-[-0.2px] group-hover:text-heading">
                            {assignment.title}
                          </h3>
                          <span
                            className="inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={GREEN_PILL_STYLE}
                          >
                            {schoolNameById.get(assignment.school_id) ?? assignment.school_id}
                          </span>
                          {attemptCount > 0 && (
                            <span
                              className="inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={YELLOW_PILL_STYLE}
                              title={`${respondentCount} students answered, ${attemptCount} attempts`}
                            >
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
                  className="w-full min-w-[12rem] rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 sm:w-auto"
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
