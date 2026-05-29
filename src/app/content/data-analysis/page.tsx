"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Download,
  RefreshCw,
  X,
} from "lucide-react";
import { DataAnalysisTabs } from "./tabs";
import { DateRangePicker, defaultPilotRange, todayRange } from "./date-range";
import { SchoolFilter } from "./school-filter";
import { badgeAmber, badgeEmerald } from "@/lib/ui/status-badge-styles";

interface OverviewResponse {
  meta: {
    from: string;
    to: string;
    totalStudentsEnrolled: number;
    schools: number;
    generatedAt: string;
  };
  headline: {
    activeStudents: number;
    attempts: number;
    sessions: number;
    totalSessionMinutes: number;
    medianSessionMinutes: number | null;
    stageCompletionRate: number | null;
    scaffoldingUpliftPp: number | null;
    correctRate: number | null;
    medianTimePerQuestionSec: number | null;
  };
  daily: Array<{
    date: string;
    attempts: number;
    activeStudents: number;
    sessions: number;
    medianSessionMinutes: number | null;
    correctRate: number | null;
  }>;
  hourly: Array<{ hour: number; attempts: number; activeStudents: number }>;
  modeMix: Array<{ mode: string; attempts: number; sessions: number; minutes: number }>;
  deviceMix: Array<{ deviceType: string; sessions: number; users: number }>;
  browserMix: Array<{ browser: string; sessions: number; users: number }>;
  osMix: Array<{ os: string; sessions: number; users: number }>;
  dataQuality: {
    zeroDurationAttempts: number;
    attemptsWithoutClientId: number;
    unclosedSessions: number;
    shortSessions: number;
    duplicateClientAttemptIds: number;
  };
  engagement: Array<{
    userId: string;
    schoolId: string;
    displayName: string;
    studentId: string;
    email: string;
    attempts: number;
    correctRate: number | null;
    sessions: number;
    sessionMinutes: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    modes: { practice: number; exam: number; review: number };
  }>;
}

type EngagementSortKey =
  | "displayName"
  | "attempts"
  | "correctRate"
  | "sessions"
  | "sessionMinutes"
  | "lastSeenAt";

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 1000) / 10}%`;
}

function pctSigned(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const v = Math.round(value * 1000) / 10;
  return `${v >= 0 ? "+" : ""}${v}pp`;
}

function minutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 1) return `${Math.round(value * 60)}s`;
  return `${value.toFixed(1)}m`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function OverviewPage() {
  const initialRange = useMemo(() => defaultPilotRange(), []);
  const [range, setRange] = useState(initialRange);
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engagementSort, setEngagementSort] = useState<{
    key: EngagementSortKey;
    dir: "asc" | "desc";
  }>({ key: "attempts", dir: "desc" });
  const [engagementSearch, setEngagementSearch] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [onlyInactive, setOnlyInactive] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (schoolIds.length > 0) params.set("schoolIds", schoolIds.join(","));
    try {
      const res = await fetch(
        `/api/admin/analytics/overview?${params.toString()}`,
        { cache: "no-store", credentials: "include" },
      );
      const payload = (await res.json()) as OverviewResponse | { error: string };
      if (!res.ok || "error" in payload) {
        setError(
          ("error" in payload && payload.error) ||
            "Failed to load overview data.",
        );
        setLoading(false);
        return;
      }
      setData(payload);
    } catch {
      setError("Network error while loading overview.");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, schoolIds]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const csvHref = useMemo(() => {
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      format: "csv",
    });
    if (schoolIds.length > 0) params.set("schoolIds", schoolIds.join(","));
    return `/api/admin/analytics/overview?${params.toString()}`;
  }, [range.from, range.to, schoolIds]);

  const expandedUser = useMemo(
    () =>
      expandedUserId
        ? data?.engagement.find((row) => row.userId === expandedUserId) ?? null
        : null,
    [data, expandedUserId],
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading mb-2">
          Data Analysis
        </h1>
      </header>

      <DataAnalysisTabs active="overview" />

      <section className="rounded-xl border border-primary/25 bg-surface p-4 sm:p-5 shadow-sm mb-6">
        <DateRangePicker value={range} onChange={setRange} />
        <div className="mt-4 max-w-xl">
          <SchoolFilter value={schoolIds} onChange={setSchoolIds} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void fetchData()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setRange(todayRange())}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/50 px-4 py-2 text-sm font-medium text-forest hover:bg-primary-light transition-colors"
          >
            Jump to today
          </button>
          <a
            href={csvHref}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/50 px-4 py-2 text-sm font-medium text-forest hover:bg-primary-light transition-colors"
          >
            <Download className="w-4 h-4" />
            Download engagement CSV
          </a>
          {data && (
            <span className="text-xs text-muted-foreground">
              {data.meta.totalStudentsEnrolled} enrolled · generated{" "}
              {formatDateTime(data.meta.generatedAt)}
            </span>
          )}
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-error-border bg-error-light px-3 py-2 text-sm text-error mb-4">
          {error}
        </p>
      )}

      {loading && !data ? (
        <p className="text-sm text-muted-foreground">Loading overview...</p>
      ) : data ? (
        <div className="space-y-6">
          <HeadlineCards data={data} />
          <DataQualityPanel data={data.dataQuality} />
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <DailyTrendChart daily={data.daily} />
              <HourlyChart hourly={data.hourly} />
            </div>
            <div className="space-y-4">
              <ModeMixCard modeMix={data.modeMix} />
              <ReachSummaryCard
                deviceRows={data.deviceMix.map((d) => ({
                  key: d.deviceType,
                  sessions: d.sessions,
                  users: d.users,
                }))}
                browserRows={data.browserMix.map((d) => ({
                  key: d.browser,
                  sessions: d.sessions,
                  users: d.users,
                }))}
                osRows={data.osMix.map((d) => ({
                  key: d.os,
                  sessions: d.sessions,
                  users: d.users,
                }))}
              />
            </div>
          </div>
          <EngagementTable
            rows={data.engagement}
            sort={engagementSort}
            onSort={(key) =>
              setEngagementSort((prev) =>
                prev.key === key
                  ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
                  : { key, dir: key === "displayName" ? "asc" : "desc" },
              )
            }
            search={engagementSearch}
            onSearchChange={setEngagementSearch}
            onlyInactive={onlyInactive}
            onOnlyInactiveChange={setOnlyInactive}
            onRowClick={setExpandedUserId}
          />
        </div>
      ) : null}

      {expandedUser && (
        <StudentDrawer
          student={expandedUser}
          onClose={() => setExpandedUserId(null)}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HeadlineCards({ data }: { data: OverviewResponse }) {
  const { headline } = data;
  const reach =
    data.meta.totalStudentsEnrolled > 0
      ? headline.activeStudents / data.meta.totalStudentsEnrolled
      : null;
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      <HeadlineCard
        label="Active students"
        value={headline.activeStudents.toLocaleString()}
        hint={
          reach !== null
            ? `${pct(reach)} of ${data.meta.totalStudentsEnrolled} enrolled`
            : undefined
        }
      />
      <HeadlineCard label="Attempts" value={headline.attempts.toLocaleString()} />
      <HeadlineCard label="Sessions" value={headline.sessions.toLocaleString()} />
      <HeadlineCard
        label="Session time"
        value={
          headline.totalSessionMinutes >= 60
            ? `${(headline.totalSessionMinutes / 60).toFixed(1)}h`
            : `${Math.round(headline.totalSessionMinutes)}m`
        }
        hint={`median ${minutes(headline.medianSessionMinutes)}`}
      />
      <HeadlineCard
        label="Correct rate"
        value={pct(headline.correctRate)}
        hint={`median time/q ${headline.medianTimePerQuestionSec ?? "—"}s`}
      />
      <HeadlineCard
        label="Stage completion"
        value={pct(headline.stageCompletionRate)}
      />
      <HeadlineCard
        label="Scaffolding uplift"
        value={pctSigned(headline.scaffoldingUpliftPp)}
        hint="final − first attempt"
      />
    </section>
  );
}

function HeadlineCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className="rounded-xl border border-border-default bg-surface p-3 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-slate-gray tabular-nums">
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </article>
  );
}

function DataQualityPanel({
  data,
}: {
  data: OverviewResponse["dataQuality"];
}) {
  const allZero =
    data.zeroDurationAttempts === 0 &&
    data.attemptsWithoutClientId === 0 &&
    data.unclosedSessions === 0 &&
    data.shortSessions === 0 &&
    data.duplicateClientAttemptIds === 0;

  return (
    <section className="rounded-xl border border-primary/25 bg-surface p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-heading">Data quality</h2>
        <span
          className={
            allZero
              ? `rounded-full px-2 py-0.5 text-xs ${badgeEmerald}`
              : `rounded-full px-2 py-0.5 text-xs inline-flex items-center gap-1 ${badgeAmber}`
          }
        >
          {allZero ? "No signals" : (
            <>
              <AlertTriangle className="w-3 h-3" />
              Review below
            </>
          )}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <QualityTile
          label="Zero-duration attempts"
          value={data.zeroDurationAttempts}
          hint="time ≤ 1 second"
        />
        <QualityTile
          label="Attempts without client id"
          value={data.attemptsWithoutClientId}
          hint="pre-idempotency rows"
        />
        <QualityTile
          label="Unclosed sessions (>6h)"
          value={data.unclosedSessions}
          hint="never sent session_ended"
        />
        <QualityTile
          label="Short sessions (<30s)"
          value={data.shortSessions}
          hint="likely bounces"
        />
        <QualityTile
          label="Duplicate client attempts"
          value={data.duplicateClientAttemptIds}
          hint="sync queue mis-fire"
        />
      </div>
    </section>
  );
}

function QualityTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  const tone =
    value === 0
      ? "border-border-default"
      : value < 5
        ? "border-amber-200 bg-amber-50/50 dark:border-amber-800/35 dark:bg-amber-950/30"
        : "border-error-border bg-error-light/50";
  return (
    <article className={`rounded-xl border ${tone} p-3`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-slate-gray tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
    </article>
  );
}

function DailyTrendChart({
  daily,
}: {
  daily: OverviewResponse["daily"];
}) {
  const maxAttempts = Math.max(1, ...daily.map((d) => d.attempts));
  const maxActive = Math.max(1, ...daily.map((d) => d.activeStudents));

  return (
    <section className="rounded-xl border border-primary/25 bg-surface p-4 sm:p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-heading mb-3">Daily trend</h2>
      {daily.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data in this window.</p>
      ) : (
        <>
          <div className="flex items-end gap-1 h-40">
            {daily.map((day) => {
              const attemptsH = (day.attempts / maxAttempts) * 100;
              const activeH = (day.activeStudents / maxActive) * 100;
              return (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center justify-end gap-0.5"
                  title={`${day.date} · ${day.attempts} attempts · ${day.activeStudents} active · ${pct(day.correctRate)} correct · ${minutes(day.medianSessionMinutes)} median session`}
                >
                  <div className="flex items-end gap-0.5 h-full w-full justify-center">
                    <div
                      className="w-2 rounded-t bg-primary"
                      style={{ height: `${attemptsH}%` }}
                    />
                    <div
                      className="w-2 rounded-t bg-amber-400"
                      style={{ height: `${activeH}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] text-[10px] text-muted-foreground">
            {daily.map((day) => (
              <div key={day.date} className="text-center truncate">
                {formatDateShort(day.date)}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-primary rounded" />
              Attempts
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2 h-2 bg-amber-400 rounded" />
              Active students
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function HourlyChart({
  hourly,
}: {
  hourly: OverviewResponse["hourly"];
}) {
  const max = Math.max(1, ...hourly.map((h) => h.attempts));
  const hasData = hourly.some((h) => h.attempts > 0);

  return (
    <section className="rounded-xl border border-primary/25 bg-surface p-4 sm:p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-heading mb-3">
        Hourly activity
      </h2>
      {!hasData ? (
        <p className="text-sm text-muted-foreground">
          No attempts in this window.
        </p>
      ) : (
        <>
          <div className="flex items-end gap-1 h-28">
            {hourly.map((row) => {
              const h = (row.attempts / max) * 100;
              return (
                <div
                  key={row.hour}
                  className="flex-1 flex flex-col items-center justify-end"
                  title={`${row.hour}:00 · ${row.attempts} attempts · ${row.activeStudents} active`}
                >
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${h}%`, minHeight: row.attempts > 0 ? 2 : 0 }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>0</span>
            <span>6</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Local times (browser timezone). Helpful to separate in-class from
            homework usage.
          </p>
        </>
      )}
    </section>
  );
}

function ModeMixCard({
  modeMix,
}: {
  modeMix: OverviewResponse["modeMix"];
}) {
  const totalAttempts = modeMix.reduce((sum, row) => sum + row.attempts, 0);
  return (
    <section className="rounded-xl border border-primary/25 bg-surface p-4 sm:p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-heading mb-3">Mode mix</h2>
      {modeMix.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-2">
          {modeMix.map((row) => {
            const share = totalAttempts > 0 ? row.attempts / totalAttempts : 0;
            return (
              <li key={row.mode}>
                <div className="flex justify-between text-sm">
                  <span className="capitalize text-slate-gray">{row.mode}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {row.attempts} · {pct(share)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-surface-muted overflow-hidden">
                  <div
                    className="h-full bg-primary/70"
                    style={{ width: `${Math.max(2, share * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {row.sessions} sessions · {Math.round(row.minutes)} total min
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ReachSummaryCard({
  deviceRows,
  browserRows,
  osRows,
}: {
  deviceRows: Array<{ key: string; sessions: number; users: number }>;
  browserRows: Array<{ key: string; sessions: number; users: number }>;
  osRows: Array<{ key: string; sessions: number; users: number }>;
}) {
  const hasAnyRows =
    deviceRows.length > 0 || browserRows.length > 0 || osRows.length > 0;

  return (
    <section className="rounded-xl border border-primary/25 bg-surface p-4 sm:p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-heading">Reach mix</h2>
      <p className="text-[11px] text-muted-foreground mb-3">
        Auto-detected from user agent
      </p>
      {!hasAnyRows ? (
        <p className="text-sm text-muted-foreground">
          No session metadata yet. New sessions will populate this.
        </p>
      ) : (
        <div className="space-y-4">
          <ReachMixList title="Device" rows={deviceRows} />
          <ReachMixList title="Browser" rows={browserRows} />
          <ReachMixList title="OS" rows={osRows} />
        </div>
      )}
    </section>
  );
}

function ReachMixList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; sessions: number; users: number }>;
}) {
  const total = rows.reduce((sum, row) => sum + row.sessions, 0);

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-1">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No session metadata yet.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {rows.slice(0, 4).map((row) => {
            const share = total > 0 ? row.sessions / total : 0;
            return (
              <li key={`${title}-${row.key}`}>
                <div className="flex justify-between">
                  <span className="text-slate-gray">{row.key}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {row.sessions} · {pct(share)}
                    <span className="text-muted-foreground ml-1">
                      ({row.users} users)
                    </span>
                  </span>
                </div>
                <div className="mt-0.5 h-1 rounded bg-surface-muted overflow-hidden">
                  <div
                    className="h-full bg-primary/70"
                    style={{ width: `${Math.max(2, share * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EngagementTable({
  rows,
  sort,
  onSort,
  search,
  onSearchChange,
  onlyInactive,
  onOnlyInactiveChange,
  onRowClick,
}: {
  rows: OverviewResponse["engagement"];
  sort: { key: EngagementSortKey; dir: "asc" | "desc" };
  onSort: (key: EngagementSortKey) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onlyInactive: boolean;
  onOnlyInactiveChange: (value: boolean) => void;
  onRowClick: (userId: string) => void;
}) {
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let filtered = rows;
    if (term) {
      filtered = filtered.filter(
        (row) =>
          row.displayName.toLowerCase().includes(term) ||
          row.studentId.toLowerCase().includes(term) ||
          row.email.toLowerCase().includes(term) ||
          row.userId.toLowerCase().includes(term),
      );
    }
    if (onlyInactive) {
      filtered = filtered.filter((row) => row.attempts === 0);
    }
    return filtered;
  }, [rows, search, onlyInactive]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    const direction = sort.dir === "asc" ? 1 : -1;
    const getValue = (
      row: OverviewResponse["engagement"][number],
    ): number | string | null => {
      switch (sort.key) {
        case "displayName":
          return row.displayName || row.studentId || row.userId;
        case "attempts":
          return row.attempts;
        case "correctRate":
          return row.correctRate;
        case "sessions":
          return row.sessions;
        case "sessionMinutes":
          return row.sessionMinutes;
        case "lastSeenAt":
          return row.lastSeenAt;
      }
    };
    copy.sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * direction;
      }
      return ((av as number) - (bv as number)) * direction;
    });
    return copy;
  }, [filteredRows, sort]);

  const inactiveCount = rows.filter((row) => row.attempts === 0).length;
  const activeCount = rows.length - inactiveCount;

  return (
    <section className="rounded-xl border border-primary/25 bg-surface shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border-subtle flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-heading">
            Per-student engagement
          </h2>
          <p className="text-xs text-muted-foreground">
            {activeCount} active · {inactiveCount} inactive of {rows.length}{" "}
            enrolled
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-gray inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={onlyInactive}
              onChange={(e) => onOnlyInactiveChange(e.target.checked)}
            />
            Inactive only
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name / email / id"
            className="rounded-lg border border-border-default px-3 py-1.5 text-sm w-60"
          />
        </div>
      </div>
      {sortedRows.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">
          No students match the current filter.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-muted-foreground">
                <SortHeader
                  label="Student"
                  active={sort.key === "displayName"}
                  dir={sort.dir}
                  onClick={() => onSort("displayName")}
                />
                <SortHeader
                  label="Attempts"
                  active={sort.key === "attempts"}
                  dir={sort.dir}
                  onClick={() => onSort("attempts")}
                />
                <SortHeader
                  label="Correct"
                  active={sort.key === "correctRate"}
                  dir={sort.dir}
                  onClick={() => onSort("correctRate")}
                />
                <SortHeader
                  label="Sessions"
                  active={sort.key === "sessions"}
                  dir={sort.dir}
                  onClick={() => onSort("sessions")}
                />
                <SortHeader
                  label="Minutes"
                  active={sort.key === "sessionMinutes"}
                  dir={sort.dir}
                  onClick={() => onSort("sessionMinutes")}
                />
                <th className="px-2 py-2 font-medium">Mix (P / E / R)</th>
                <SortHeader
                  label="Last seen"
                  active={sort.key === "lastSeenAt"}
                  dir={sort.dir}
                  onClick={() => onSort("lastSeenAt")}
                />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const nameFallback =
                  row.displayName ||
                  row.studentId ||
                  row.email ||
                  row.userId.slice(0, 8);
                return (
                  <tr
                    key={row.userId}
                    onClick={() => onRowClick(row.userId)}
                    className="border-b border-border-subtle hover:bg-surface-muted cursor-pointer"
                  >
                    <td className="px-2 py-2">
                      <p className="font-medium text-slate-gray">{nameFallback}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.studentId || row.email || row.userId.slice(0, 8)}
                      </p>
                    </td>
                    <td className="px-2 py-2 tabular-nums">{row.attempts}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {pct(row.correctRate)}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{row.sessions}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {Math.round(row.sessionMinutes)}m
                    </td>
                    <td className="px-2 py-2 tabular-nums text-slate-gray/80">
                      {row.modes.practice} / {row.modes.exam} / {row.modes.review}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                      {row.lastSeenAt
                        ? new Date(row.lastSeenAt).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th
      className={`px-2 py-2 font-medium cursor-pointer select-none ${active ? "text-slate-gray" : "hover:text-foreground"}`}
      onClick={onClick}
    >
      {label}
      {active &&
        (dir === "asc" ? (
          <ArrowUp className="inline w-3 h-3 ml-1" />
        ) : (
          <ArrowDown className="inline w-3 h-3 ml-1" />
        ))}
    </th>
  );
}

function StudentDrawer({
  student,
  onClose,
}: {
  student: OverviewResponse["engagement"][number];
  onClose: () => void;
}) {
  const nameFallback =
    student.displayName ||
    student.studentId ||
    student.email ||
    student.userId.slice(0, 8);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute inset-0 bg-black/30"
      />
      <aside className="relative h-full w-full sm:w-[520px] bg-surface shadow-2xl overflow-y-auto">
        <header className="sticky top-0 bg-surface border-b border-border-subtle px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Student detail
            </p>
            <h3 className="text-lg font-semibold text-heading">
              {nameFallback}
            </h3>
            <p className="text-xs text-muted-foreground">
              {student.studentId || student.email || student.userId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="p-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailStat label="Attempts" value={student.attempts} />
            <DetailStat label="Correct rate" value={pct(student.correctRate)} />
            <DetailStat label="Sessions" value={student.sessions} />
            <DetailStat
              label="Session minutes"
              value={Math.round(student.sessionMinutes)}
            />
          </div>
          <div className="rounded-xl border border-border-default p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Mode mix
            </p>
            <p className="text-sm">
              Practice {student.modes.practice} · Exam {student.modes.exam} ·
              Review {student.modes.review}
            </p>
          </div>
          <div className="rounded-xl border border-border-default p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Timeline
            </p>
            <p className="text-sm">
              First seen: {formatDateTime(student.firstSeenAt)}
            </p>
            <p className="text-sm">
              Last seen: {formatDateTime(student.lastSeenAt)}
            </p>
          </div>
          <div className="rounded-xl border border-border-default p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              Deep-dive links
            </p>
            <div className="flex flex-wrap gap-2 text-sm">
              <a
                href={`/content/data-analysis/students?student=${encodeURIComponent(student.userId)}`}
                className="inline-flex items-center rounded-md border border-primary/40 px-2 py-1 text-forest hover:bg-primary-light"
              >
                Open in Student attempts
              </a>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border-default p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold text-slate-gray tabular-nums">
        {value}
      </p>
    </div>
  );
}
