"use client";

import { useMemo, useState } from "react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import { selectNextStep } from "@/lib/assignments/select-next-step";
import { NextStepCard } from "@/components/assignments/NextStepCard";
import { AssignmentRow } from "@/components/assignments/AssignmentRow";
import { CompletedSection } from "@/components/assignments/CompletedSection";

const UPCOMING_PAGE_SIZE = 6;

interface StudentAssignmentsListProps {
  assignments: StudentAssignmentListItem[];
  loadError: string | null;
}

export function StudentAssignmentsList({
  assignments,
  loadError,
}: StudentAssignmentsListProps) {
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);

  const { nextStep, others } = useMemo(
    () => selectNextStep(assignments),
    [assignments],
  );

  const completed = useMemo(
    () => assignments.filter((a) => a.status === "completed"),
    [assignments],
  );

  const visibleOthers = upcomingExpanded
    ? others
    : others.slice(0, UPCOMING_PAGE_SIZE);
  const hiddenCount = others.length - UPCOMING_PAGE_SIZE;

  return (
    <main className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <h1 className="text-[30px] font-semibold text-heading mb-10">
        My Assignments
      </h1>

      {loadError && (
        <div className="rounded-lg border border-error-border bg-error-light px-4 py-3 mb-10">
          <p className="text-sm text-error">
            Failed to load assignments. Please refresh and try again.
          </p>
        </div>
      )}

      {nextStep === null ? (
        <section className="rounded-2xl border border-primary/30 bg-surface p-6 shadow-sm mb-10">
          <p className="text-slate-gray">No incomplete assignments right now.</p>
        </section>
      ) : (
        <div className="mb-10">
          <NextStepCard assignment={nextStep} />
        </div>
      )}

      {others.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Upcoming
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleOthers.map((a) => (
              <AssignmentRow key={a.id} assignment={a} />
            ))}
          </div>
          {!upcomingExpanded && hiddenCount > 0 && (
            <p className="text-center mt-4">
              <button
                type="button"
                onClick={() => setUpcomingExpanded(true)}
                className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View all ({others.length})
              </button>
            </p>
          )}
        </section>
      )}

      <CompletedSection assignments={completed} />
    </main>
  );
}
