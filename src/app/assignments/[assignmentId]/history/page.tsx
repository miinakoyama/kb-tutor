"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  History as HistoryIcon,
  Loader2,
} from "lucide-react";

interface AttemptRow {
  attempt_number: number;
  started_at: string;
  completed_at: string;
  correct_count: number;
  total_count: number;
}

interface HistoryPayload {
  assignment: {
    id: string;
    title: string;
    mode: string;
    max_attempts: number | null;
  };
  attempts: AttemptRow[];
}

export default function AssignmentHistoryPage() {
  const params = useParams<{ assignmentId: string }>();
  const assignmentId = params.assignmentId;

  const [data, setData] = useState<HistoryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/assignments/${encodeURIComponent(assignmentId)}/history`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as Partial<HistoryPayload> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load attempt history.");
      }
      setData(payload as HistoryPayload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load attempt history.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 text-center text-slate-gray/70">
        <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
        Loading attempt history...
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <Link
          href="/assignments"
          className="inline-flex items-center gap-1 text-sm text-slate-gray/70 hover:text-[#16a34a]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to assignments
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Attempt history is not available."}
        </div>
      </main>
    );
  }

  const { assignment, attempts } = data;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:py-10 space-y-6">
      <Link
        href="/assignments"
        className="inline-flex items-center gap-1 text-sm text-slate-gray/70 hover:text-[#16a34a]"
      >
        <ArrowLeft className="w-4 h-4" /> Back to assignments
      </Link>

      <header className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <HistoryIcon className="w-5 h-5 text-[#14532d]" />
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d]">
            Past attempts
          </h1>
        </div>
        <p className="text-slate-gray/70 text-sm">{assignment.title}</p>
        <p className="text-xs text-slate-gray/60">
          {assignment.max_attempts != null
            ? `Attempts used: ${attempts.length} / ${assignment.max_attempts}`
            : `Attempts used: ${attempts.length}`}
        </p>
      </header>

      {attempts.length === 0 ? (
        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm text-center">
          <p className="text-slate-gray">
            You haven&apos;t completed this assignment yet.
          </p>
        </section>
      ) : (
        <ul className="space-y-3">
          {attempts.map((attempt) => {
            const total = attempt.total_count;
            const correct = attempt.correct_count;
            const percent =
              total > 0 ? Math.round((correct / total) * 100) : 0;
            return (
              <li key={attempt.attempt_number}>
                <Link
                  href={`/assignments/${encodeURIComponent(assignmentId)}/history/${attempt.attempt_number}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-gray">
                      Attempt {attempt.attempt_number}
                    </p>
                    <p className="text-xs text-slate-gray/60 mt-1">
                      Completed{" "}
                      {new Date(attempt.completed_at).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-gray/60 mt-0.5">
                      Score: {correct} / {total}{" "}
                      {total > 0 ? `(${percent}%)` : ""}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-gray/40 flex-shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
