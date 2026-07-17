"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { DateRangePicker, defaultPilotRange } from "../date-range";
import { SchoolFilter } from "../school-filter";
import { badgeEmerald, buttonOutlinePrimary } from "@/lib/ui/status-badge-styles";

interface Summary {
  schools: number;
  students: number;
  attempts: number;
  correctRate: number;
  averageTimeSec: number;
  from?: string;
  to?: string;
}

interface AttemptRow {
  id: string;
  schoolId: string;
  studentUserId: string;
  studentId: string;
  studentName: string;
  email: string;
  mode: string;
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
  standardId: string;
  standardLabel: string;
  timeSpentSec: number | null;
  answeredAt: string;
}

export default function DataAnalysisPage() {
  return (
    <Suspense fallback={null}>
      <StudentsInner />
    </Suspense>
  );
}

function StudentsInner() {
  const searchParams = useSearchParams();
  const initialRange = useMemo(() => defaultPilotRange(), []);
  const [range, setRange] = useState(initialRange);
  const { from, to } = range;
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [mode, setMode] = useState("all");
  const [student, setStudent] = useState(searchParams.get("student") ?? "");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });
    if (schoolIds.length > 0) params.set("schoolIds", schoolIds.join(","));
    if (mode !== "all") params.set("mode", mode);
    if (student.trim()) params.set("student", student.trim());

    const response = await fetch(`/api/admin/analytics?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
    });

    const payload = (await response.json()) as {
      error?: string;
      summary?: Summary;
      rows?: AttemptRow[];
    };

    if (!response.ok) {
      setError(payload.error ?? "Failed to load analytics data.");
      setLoading(false);
      return;
    }

    setSummary(payload.summary ?? null);
    setRows(payload.rows ?? []);
    setLoading(false);
  }, [from, mode, schoolIds, student, to]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const csvHref = useMemo(() => {
    const params = new URLSearchParams({ from, to, format: "csv" });
    if (schoolIds.length > 0) params.set("schoolIds", schoolIds.join(","));
    if (mode !== "all") params.set("mode", mode);
    if (student.trim()) params.set("student", student.trim());
    return `/api/admin/analytics?${params.toString()}`;
  }, [from, mode, schoolIds, student, to]);

  return (
    <>

      <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-5 sm:p-6 shadow-[var(--assignment-card-shadow)] mb-6">
        <DateRangePicker value={range} onChange={setRange} />

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SchoolFilter value={schoolIds} onChange={setSchoolIds} />
          <label className="text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Mode</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="all">All modes</option>
              <option value="practice">Practice</option>
              <option value="exam">Exam</option>
              <option value="review">Review</option>
            </select>
          </label>
          <label className="text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Student filter (user id)</span>
            <input
              type="text"
              value={student}
              onChange={(event) => setStudent(event.target.value)}
              placeholder="Filter by student user id"
              className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void fetchData()}
            className="inline-flex items-center gap-2 rounded-full font-heading font-bold px-5 py-2 text-sm transition duration-200 hover:brightness-110 active:brightness-95 border-[1.5px] border-[var(--assignment-glass-border)] bg-[var(--assignment-cta-bg-strong)] text-[var(--assignment-cta-text)] shadow-[var(--assignment-cta-elevated-shadow)]"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <a
            href={csvHref}
            className={buttonOutlinePrimary}
          >
            <Download className="w-4 h-4" />
            Download CSV
          </a>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-error-border bg-error-light px-3.5 py-2.5 text-sm text-error mb-6">
          {error}
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        <MetricCard label="Schools" value={summary?.schools ?? 0} />
        <MetricCard label="Students" value={summary?.students ?? 0} />
        <MetricCard label="Attempts" value={summary?.attempts ?? 0} />
        <MetricCard label="Correct rate" value={`${summary?.correctRate ?? 0}%`} />
        <MetricCard label="Avg time / question" value={`${summary?.averageTimeSec ?? 0}s`} />
      </section>

      <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-5 sm:p-6 shadow-[var(--assignment-card-shadow)]">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading analytics data...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attempt data for the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Answered At</th>
                  <th className="px-2 py-2 font-medium">School</th>
                  <th className="px-2 py-2 font-medium">Student</th>
                  <th className="px-2 py-2 font-medium">Mode</th>
                  <th className="px-2 py-2 font-medium">Question</th>
                  <th className="px-2 py-2 font-medium">Correct</th>
                  <th className="px-2 py-2 font-medium">Standard</th>
                  <th className="px-2 py-2 font-medium">Time (s)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border-subtle">
                    <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(row.answeredAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.schoolId}</td>
                    <td className="px-2 py-2 min-w-[220px]">
                      <p className="font-medium text-slate-gray">{row.studentName || "-"}</p>
                      <p className="text-xs text-muted-foreground">{row.studentId || row.studentUserId}</p>
                    </td>
                    <td className="px-2 py-2 capitalize">{row.mode}</td>
                    <td className="px-2 py-2 text-slate-gray/80">{row.questionId}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          row.isCorrect
                            ? badgeEmerald
                            : "bg-error-light text-error border border-error-border"
                        }`}
                      >
                        {row.isCorrect ? "Correct" : "Incorrect"}
                      </span>
                    </td>
                    <td className="px-2 py-2 min-w-[180px] text-slate-gray/80">
                      {row.standardId || row.standardLabel || "-"}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {row.timeSpentSec ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-xl border border-border-default bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-gray">{value}</p>
    </article>
  );
}
