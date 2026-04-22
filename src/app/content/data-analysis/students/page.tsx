"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { DataAnalysisTabs } from "../tabs";
import { DateRangePicker, defaultPilotRange } from "../date-range";
import { SchoolFilter } from "../school-filter";

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
  timeSpentSec: number;
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
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
          Data Analysis
        </h1>
      </header>

      <DataAnalysisTabs active="students" />

      <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm mb-6">
        <DateRangePicker value={range} onChange={setRange} />

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SchoolFilter value={schoolIds} onChange={setSchoolIds} />
          <label className="text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Mode</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
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
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void fetchData()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <a
            href={csvHref}
            className="inline-flex items-center gap-2 rounded-lg border border-[#16a34a]/50 px-4 py-2 text-sm font-medium text-[#166534] hover:bg-green-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </a>
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">
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

      <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-gray/70">Loading analytics data...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-gray/70">No attempt data for the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
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
                  <tr key={`${row.studentUserId}-${row.questionId}-${row.answeredAt}`} className="border-b border-slate-100">
                    <td className="px-2 py-2 whitespace-nowrap text-slate-gray/70">
                      {new Date(row.answeredAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.schoolId}</td>
                    <td className="px-2 py-2 min-w-[220px]">
                      <p className="font-medium text-slate-gray">{row.studentName || "-"}</p>
                      <p className="text-xs text-slate-gray/70">{row.studentId || row.studentUserId}</p>
                    </td>
                    <td className="px-2 py-2 capitalize">{row.mode}</td>
                    <td className="px-2 py-2 text-slate-gray/80">{row.questionId}</td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          row.isCorrect
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {row.isCorrect ? "Correct" : "Incorrect"}
                      </span>
                    </td>
                    <td className="px-2 py-2 min-w-[180px] text-slate-gray/80">
                      {row.standardId || row.standardLabel || "-"}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{row.timeSpentSec}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-gray/60">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-gray">{value}</p>
    </article>
  );
}
