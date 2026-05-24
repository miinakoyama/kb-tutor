"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * NextSessionCTA — primary action shown on practice / exam / review summary
 * screens to keep students moving once a session is done.
 *
 * Behavior:
 *  - Fetches /api/student-assignments/next on mount. The endpoint returns
 *    either the most-urgent remaining assignment for the student or a
 *    fallback to Self Practice when nothing else is pending.
 *  - Renders a single primary button labeled with concrete next-action
 *    copy ("Continue with: <assignment>" or "Go to Self Practice").
 *  - When the lookup fails (network, non-student, etc.) the component
 *    renders nothing so the summary screen still degrades cleanly to the
 *    existing Try Again / Home actions.
 *
 * `excludeAssignmentId` should be set whenever this CTA is mounted from an
 * assignment session's summary screen — that prevents the API from
 * suggesting "the assignment you just finished" while the completion API
 * race is still propagating.
 */

interface NextSessionCTAProps {
  /** Assignment the student just finished, if any — excluded from candidates. */
  excludeAssignmentId?: string | null;
}

type AssignmentMode = "practice" | "exam" | "review";

interface ApiAssignment {
  id: string;
  title: string;
  mode: AssignmentMode;
  due_date: string | null;
  target_minutes: number;
  max_questions: number | null;
  topics: string[];
  status: "not_started" | "in_progress" | "completed";
}

type NextActionResponse =
  | { type: "assignment"; assignment: ApiAssignment }
  | { type: "self_practice" };

function estimateQuestionCount(targetMinutes: number): number {
  return Math.max(6, Math.min(40, Math.round(targetMinutes / 1.8)));
}

function buildPracticeHref(assignment: ApiAssignment): string {
  // Keep the URL shape identical to StudentAssignmentsList's
  // buildPracticeHref so deep-linking from this CTA hits the same
  // PracticePageClient code path (resume-aware, assignment-mode answered
  // map, etc.) without any new server-side branches.
  const questionCount =
    assignment.max_questions ?? estimateQuestionCount(assignment.target_minutes);
  const params = new URLSearchParams({
    mode: assignment.mode,
    assignmentId: assignment.id,
    questions: String(questionCount),
    topics: assignment.topics.join(","),
  });
  return `/practice?${params.toString()}`;
}

function ctaVerbFor(status: ApiAssignment["status"]): string {
  if (status === "in_progress") return "Continue";
  return "Start";
}

export function NextSessionCTA({ excludeAssignmentId }: NextSessionCTAProps) {
  const [data, setData] = useState<NextActionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (excludeAssignmentId) {
      params.set("excludeAssignmentId", excludeAssignmentId);
    }
    const url = params.toString()
      ? `/api/student-assignments/next?${params.toString()}`
      : "/api/student-assignments/next";

    setIsLoading(true);
    setErrored(false);
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as NextActionResponse;
        if (cancelled) return;
        setData(body);
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
        if (cancelled) return;
        setErrored(true);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [excludeAssignmentId]);

  // While loading we render a low-emphasis placeholder. This keeps the
  // summary screen vertically stable rather than shifting once the answer
  // lands a couple hundred ms later.
  if (isLoading) {
    return (
      <div
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#16a34a]/20 text-[#14532d]/70 text-sm font-medium min-h-[44px]"
        aria-hidden
      >
        Loading next step…
      </div>
    );
  }

  if (errored || !data) {
    // Network failure / non-student. Render nothing so the existing
    // Try Again / Home actions still cover the journey.
    return null;
  }

  if (data.type === "self_practice") {
    return (
      <Link
        href="/self-practice"
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#16a34a] text-white text-sm font-semibold hover:bg-[#15803d] transition-colors min-h-[44px] shadow-sm"
      >
        <Sparkles className="w-4 h-4" />
        <span>Go to Self Practice</span>
        <ArrowRight className="w-4 h-4" />
      </Link>
    );
  }

  const verb = ctaVerbFor(data.assignment.status);
  return (
    <Link
      href={buildPracticeHref(data.assignment)}
      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#16a34a] text-white text-sm font-semibold hover:bg-[#15803d] transition-colors min-h-[44px] shadow-sm max-w-full"
    >
      <span className="truncate">
        {verb} next: {data.assignment.title}
      </span>
      <ArrowRight className="w-4 h-4 flex-shrink-0" />
    </Link>
  );
}
