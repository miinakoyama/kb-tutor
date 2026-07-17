"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { selectNextStep } from "@/lib/assignments/select-next-step";
import { NextStepCard } from "@/components/assignments/NextStepCard";
import { AssignmentRow } from "@/components/assignments/AssignmentRow";
import { CompletedSection } from "@/components/assignments/CompletedSection";
import { ThisWeekSidebar } from "@/components/assignments/ThisWeekSidebar";

const ACTIVE_PAGE_SIZE = 4;

interface StudentAssignmentsListProps {
  assignments: StudentAssignmentListItem[];
  loadError: string | null;
  /** Pre-fills the search box (e.g. arriving from the homepage search). */
  initialQuery?: string;
}

export function StudentAssignmentsList({
  assignments,
  loadError,
  initialQuery = "",
}: StudentAssignmentsListProps) {
  const [activeExpanded, setActiveExpanded] = useState(false);
  const [query, setQuery] = useState(initialQuery);

  const q = query.trim().toLowerCase();

  // Non-completed, sorted by due_date asc (null last)
  const activeAssignments = useMemo(
    () =>
      assignments
        .filter((a) => a.status !== "completed")
        .sort((a, b) => {
          const aT = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const bT = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return aT - bT;
        }),
    [assignments],
  );

  // Completed, sorted by last_completed_at desc
  const completedAssignments = useMemo(
    () =>
      assignments
        .filter((a) => a.status === "completed")
        .sort((a, b) => {
          const aT = a.last_completed_at
            ? new Date(a.last_completed_at).getTime()
            : 0;
          const bT = b.last_completed_at
            ? new Date(b.last_completed_at).getTime()
            : 0;
          return bT - aT;
        }),
    [assignments],
  );

  // Apply search filter
  const filteredActive = useMemo(
    () => (q ? activeAssignments.filter((a) => a.title.toLowerCase().includes(q)) : activeAssignments),
    [activeAssignments, q],
  );
  const filteredCompleted = useMemo(
    () => (q ? completedAssignments.filter((a) => a.title.toLowerCase().includes(q)) : completedAssignments),
    [completedAssignments, q],
  );

  // nextStep derived from filtered active
  const { nextStep } = useMemo(() => selectNextStep(q ? filteredActive : assignments), [filteredActive, assignments, q]);

  const visibleActive = activeExpanded
    ? filteredActive
    : filteredActive.slice(0, ACTIVE_PAGE_SIZE);

  const hasIncompleteAssignments = activeAssignments.length > 0;

  const showViewAll =
    !activeExpanded && filteredActive.length > ACTIVE_PAGE_SIZE;

  return (
    <main
      className="mx-auto w-full px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-10 xl:px-12"
      style={{
        maxWidth: 1500,
      }}
    >
      <div className="mx-auto mb-8 w-full xl:w-[96%]">
        {/* Search bar */}
        <div className="relative w-full max-w-[460px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            style={{ width: 15, height: 15 }}
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search assignments…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveExpanded(false); }}
            className="w-full bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            style={{
              paddingLeft: 36,
              paddingRight: 14,
              height: 38,
              fontSize: 14,
              borderRadius: 999,
              background: "var(--assignment-search-bg)",
              border: "1px solid var(--assignment-search-border)",
              boxShadow: "var(--assignment-search-shadow)",
              backdropFilter: "blur(14px) saturate(112%)",
              WebkitBackdropFilter: "blur(14px) saturate(112%)",
            }}
          />
        </div>

      </div>

      {loadError && (
        <div className="rounded-lg border border-error-border bg-error-light px-4 py-3" style={{ marginBottom: 28 }}>
          <p className="text-sm text-error">
            Failed to load assignments. Please refresh and try again.
          </p>
        </div>
      )}

      <div className="flex flex-col items-start gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_1px_minmax(300px,360px)]">
        {/* Main column */}
        <div className="min-w-0 w-full space-y-10">

          {hasIncompleteAssignments ? (
            <>
              {nextStep && (
                <section className="mx-auto w-full xl:w-[96%]">
                  <h1
                    className="font-medium text-muted-foreground uppercase tracking-wide"
                    style={{ fontSize: 14, marginBottom: 10 }}
                  >
                    UP NEXT
                  </h1>
                  <NextStepCard assignment={nextStep} />
                </section>
              )}

              <section>
                <h2
                  className="font-medium text-muted-foreground uppercase tracking-wide"
                  style={{ fontSize: 14, marginBottom: 10 }}
                >
                  <span className="mx-auto block w-full xl:w-[96%]">
                    All Assignments
                  </span>
                </h2>

                <div className="mx-auto w-full xl:w-[96%]">
                  {filteredActive.length === 0 ? (
                    <p className="rounded-2xl bg-surface px-5 py-6 text-sm text-muted-foreground">
                      No assignments match your search.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {visibleActive.map((a) => (
                        <AssignmentRow
                          key={a.id}
                          assignment={a}
                          isNextStep={nextStep?.id === a.id}
                        />
                      ))}
                    </div>
                  )}

                  {showViewAll && (
                    <div
                      className="mt-3 rounded-2xl px-5 py-3"
                      style={{
                        background: "var(--assignment-glass-bg)",
                        border: "1px solid var(--assignment-glass-border)",
                        boxShadow: "var(--assignment-card-shadow)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveExpanded(true)}
                        className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        View all assignments →
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : (
            <section className="mx-auto w-full xl:w-[96%]">
              <div
                className="flex items-center gap-4 rounded-2xl px-5 py-6 sm:px-6"
                style={{
                  background: "var(--assignment-glass-bg-strong)",
                  border: "1px solid var(--assignment-glass-border)",
                  boxShadow: "var(--assignment-elevated-shadow)",
                }}
              >
                <CheckCircle2
                  className="h-6 w-6 flex-shrink-0"
                  style={{ color: "var(--assignment-completed)" }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p
                    className="text-slate-gray"
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      lineHeight: 1.35,
                      fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
                    }}
                  >
                    All assignments complete
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You have completed every teacher-assigned assignment.
                  </p>
                </div>
              </div>
            </section>
          )}

          <div className="mx-auto w-full xl:w-[96%]">
            <CompletedSection assignments={filteredCompleted} />
          </div>
        </div>

        {/* Right rail */}
        <div
          className="hidden self-stretch xl:block"
          style={{
            background: "var(--border-subtle)",
            transform: "translateX(-12px)",
          }}
          aria-hidden="true"
        />

        <div className="w-full max-w-full xl:sticky xl:top-8 xl:self-start">
          <ThisWeekSidebar assignments={assignments} />
        </div>
      </div>
    </main>
  );
}
