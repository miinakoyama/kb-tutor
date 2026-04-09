"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  Download,
  Users,
  Target,
  CheckCircle2,
  Timer,
  BarChart3,
  School,
} from "lucide-react";
import {
  downloadStandardMetricsCsv,
  downloadStudentMetricsCsv,
} from "@/lib/csv/teacher-dashboard";

export default function TeacherDashboardPage() {
  return <TeacherDashboardContent />;
}

function TeacherDashboardContent() {
  const [classId, setClassId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [range, setRange] = useState<"7d" | "30d" | "all">("30d");
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<{
    classes: { id: string; name: string }[];
    students: { id: string; label: string }[];
    summary: { totalAnswered: number; totalCorrect: number; overallAccuracy: number };
    byStandard: {
      standardId: string;
      standardLabel: string;
      attempted: number;
      correct: number;
      accuracy: number;
      averageTimeSec: number;
    }[];
    byStudent: {
      studentId: string;
      label: string;
      totalAnswered: number;
      totalCorrect: number;
      accuracy: number;
    }[];
  }>({
    classes: [],
    students: [],
    summary: { totalAnswered: 0, totalCorrect: 0, overallAccuracy: 0 },
    byStandard: [],
    byStudent: [],
  });

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const params = new URLSearchParams({
        range,
      });
      if (classId) params.set("classId", classId);
      if (studentId) params.set("studentId", studentId);

      const response = await fetch(`/api/teacher-dashboard?${params.toString()}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const json = (await response.json()) as typeof data;
        setData(json);
      }
      setIsLoading(false);
    };
    void load();
  }, [classId, studentId, range]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d] mb-2">
            Teacher Dashboard
          </h1>
          <p className="text-slate-gray/70">
            Standard-level performance and engagement metrics for assigned
            students.
          </p>
        </div>
        <Link
          href="/teacher/classes"
          className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15803d] transition-colors shadow-sm flex-shrink-0"
        >
          <School className="w-4 h-4" />
          Open Class Management
        </Link>
      </section>

      <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm mb-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Class</span>
            <select
              value={classId}
              onChange={(event) => {
                setClassId(event.target.value);
                setStudentId("");
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="">All classes</option>
              {data.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Student</span>
            <select
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="">All students</option>
              {data.students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Date range</span>
            <select
              value={range}
              onChange={(event) =>
                setRange(event.target.value as "7d" | "30d" | "all")
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <MetricCard
          label="Total Questions Answered"
          value={data.summary.totalAnswered}
          icon={Target}
        />
        <MetricCard
          label="Total Correct"
          value={data.summary.totalCorrect}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Overall Accuracy"
          value={`${data.summary.overallAccuracy}%`}
          icon={BarChart3}
        />
        <MetricCard
          label="Students in Scope"
          value={data.byStudent.length}
          icon={Users}
        />
      </section>

      <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-slate-gray">By Standard</h2>
          <button
            onClick={() => downloadStandardMetricsCsv(data.byStandard)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-3 py-2 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-gray/60 border-b border-slate-200">
                <th className="py-2 pr-3">Standard</th>
                <th className="py-2 pr-3">Attempted</th>
                <th className="py-2 pr-3">Correct</th>
                <th className="py-2 pr-3">Accuracy</th>
                <th className="py-2">Avg time</th>
              </tr>
            </thead>
            <tbody>
              {data.byStandard.map((row) => (
                <tr key={row.standardId} className="border-b border-slate-100">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-slate-gray">
                      {row.standardId}
                    </p>
                    <p className="text-xs text-slate-gray/60">
                      {row.standardLabel}
                    </p>
                  </td>
                  <td className="py-2 pr-3">{row.attempted}</td>
                  <td className="py-2 pr-3">{row.correct}</td>
                  <td className="py-2 pr-3">{row.accuracy}%</td>
                  <td className="py-2 inline-flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-slate-gray/50" />
                    {row.averageTimeSec}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-slate-gray">By Student</h2>
          <button
            onClick={() => downloadStudentMetricsCsv(data.byStudent)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#16a34a] px-3 py-2 text-sm font-medium text-[#166534] hover:bg-[#16a34a]/10 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-gray/60 border-b border-slate-200">
                <th className="py-2 pr-3">Student</th>
                <th className="py-2 pr-3">Answered</th>
                <th className="py-2 pr-3">Correct</th>
                <th className="py-2">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {data.byStudent.map((row) => (
                <tr key={row.studentId} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{row.label}</td>
                  <td className="py-2 pr-3">{row.totalAnswered}</td>
                  <td className="py-2 pr-3">{row.totalCorrect}</td>
                  <td className="py-2">{row.accuracy}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {isLoading && (
        <p className="text-sm text-slate-gray/60 mt-4">Loading dashboard data...</p>
      )}

    </main>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <article className="rounded-xl border border-[#16a34a]/20 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-gray/60 uppercase tracking-wide">
          {label}
        </p>
        <Icon className="w-4 h-4 text-[#16a34a]" />
      </div>
      <p className="text-2xl font-bold text-[#14532d]">{value}</p>
    </article>
  );
}
