"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Power,
  RefreshCw,
  RotateCcw,
  School as SchoolIcon,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

type View = "coverage" | "runs" | "exceptions";
type ApiRow = Record<string, unknown>;
type Kc = { code: string; statement: string };
type School = { id: string; name: string };
type KcBreakdown = { code: string; statement: string; mcqCount: number; saqCount: number };

const ALL_SCHOOLS = "";

function text(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function kcBreakdown(value: unknown): KcBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    isRecord(item) && typeof item.code === "string"
      ? [
          {
            code: item.code,
            statement: typeof item.statement === "string" ? item.statement : "",
            mcqCount: num(item.mcqCount),
            saqCount: num(item.saqCount),
          },
        ]
      : [],
  );
}

// Shared glass surface used across the assignment design system.
const glassCard: React.CSSProperties = {
  background: "var(--assignment-glass-bg)",
  border: "1px solid var(--assignment-glass-border)",
  boxShadow: "var(--assignment-card-shadow)",
  backdropFilter: "blur(14px) saturate(115%)",
  WebkitBackdropFilter: "blur(14px) saturate(115%)",
};

const geist = "var(--font-geist), ui-sans-serif, sans-serif";

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  return (
    <div className="flex flex-shrink-0 flex-col">
      <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className="whitespace-nowrap text-slate-gray"
        style={{
          fontSize: 17,
          fontWeight: 600,
          fontFamily: geist,
          color:
            tone === "warn" ? "var(--assignment-overdue)" : tone === "ok" ? "var(--assignment-completed)" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "ok" | "warn" | "neutral" }) {
  const styles: Record<typeof tone, React.CSSProperties> = {
    ok: { color: "var(--assignment-completed)", background: "rgb(12 107 69 / 0.12)" },
    warn: { color: "var(--assignment-overdue)", background: "rgb(180 83 9 / 0.12)" },
    neutral: { color: "var(--muted-foreground)", background: "rgb(100 116 139 / 0.12)" },
  };
  return (
    <span
      className="inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1 capitalize"
      style={{
        fontSize: 13,
        fontWeight: 600,
        fontFamily: geist,
        boxShadow: "var(--assignment-pill-highlight)",
        ...styles[tone],
      }}
    >
      {label}
    </span>
  );
}

// Primary (green) and secondary (glass) action buttons matching AssignmentRow CTAs.
function ActionButton({
  children,
  onClick,
  disabled,
  variant = "secondary",
  title,
  dense,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  title?: string;
  // Coverage rows pack a badge, five metrics, and three buttons onto one
  // line — trimmed padding/gap buys back just enough width to avoid the
  // last metric wrapping onto its own line.
  dense?: boolean;
}) {
  const variants: Record<string, React.CSSProperties> = {
    primary: {
      color: "var(--assignment-cta-text)",
      background: "var(--assignment-cta-bg-strong)",
      border: "1.5px solid var(--assignment-glass-border)",
      boxShadow: "var(--assignment-cta-elevated-shadow)",
    },
    secondary: {
      color: "var(--assignment-row-cta-text)",
      background: "var(--assignment-row-cta-bg)",
      border: "1.5px solid var(--assignment-row-cta-border)",
      boxShadow: "var(--assignment-row-cta-shadow)",
    },
    danger: {
      color: "var(--assignment-overdue)",
      background: "rgb(180 83 9 / 0.1)",
      border: "1.5px solid rgb(180 83 9 / 0.22)",
    },
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center whitespace-nowrap text-sm font-semibold transition duration-200 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${dense ? "gap-1.5 px-3" : "gap-2 px-4"}`}
      style={{ borderRadius: 999, fontFamily: geist, ...variants[variant] }}
    >
      {children}
    </button>
  );
}

export default function KcCoveragePage() {
  const [view, setView] = useState<View>("coverage");
  const [rows, setRows] = useState<ApiRow[]>([]);
  const [kcs, setKcs] = useState<Record<string, Kc[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKc, setSelectedKc] = useState<Record<string, string>>({});
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState<string>(ALL_SCHOOLS);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view, limit: "100" });
      if (view === "coverage" && schoolId) params.set("schoolId", schoolId);
      const response = await fetch(`/api/admin/kc-coverage?${params}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        rows?: ApiRow[];
        kcs?: Record<string, Kc[]>;
        schools?: School[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load KC coverage");
      setRows(payload.rows ?? []);
      setKcs(payload.kcs ?? {});
      if (payload.schools) setSchools(payload.schools);
    } catch (loadError) {
      setRows([]);
      setKcs({});
      setError(loadError instanceof Error ? loadError.message : "Unable to load KC coverage");
    } finally {
      setLoading(false);
    }
  }, [view, schoolId]);

  useEffect(() => void load(), [load]);

  const command = async (key: string, body: Record<string, unknown>, confirmation: string) => {
    if (!window.confirm(confirmation)) return;
    setBusyKey(key);
    setError(null);
    try {
      const response = await fetch("/api/admin/kc-coverage/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, confirmed: true }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Coverage command failed");
      await load();
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : "Coverage command failed");
    } finally {
      setBusyKey(null);
    }
  };

  const tabs: View[] = ["coverage", "runs", "exceptions"];

  return (
    <main className="mx-auto w-full px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12" style={{ maxWidth: 1500 }}>
      {/* Header */}
      <header className="mb-7">
        <Link
          href="/content"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Content Management
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ background: "rgb(12 107 69 / 0.12)" }}
            >
              <ShieldCheck className="h-6 w-6" style={{ color: "var(--assignment-completed)" }} />
            </span>
            <div>
              <h1
                className="text-slate-gray"
                style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4, fontFamily: geist }}
              >
                KC Coverage
              </h1>
              <p className="text-sm text-muted-foreground">
                Governance for adaptive Practice eligibility
              </p>
            </div>
          </div>
          <ActionButton onClick={() => void load()} title="Reload">
            <RefreshCw className="h-4 w-4" /> Refresh
          </ActionButton>
        </div>
      </header>

      {/* Tabs (segmented pill control) */}
      <div
        className="mb-6 inline-flex gap-1 rounded-full p-1"
        role="tablist"
        aria-label="KC coverage views"
        style={glassCard}
      >
        {tabs.map((item) => {
          const active = view === item;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                // Clear rows synchronously so a previous view's data (a
                // different row shape) is never rendered under the new view.
                setView(item);
                setRows([]);
                setLoading(true);
              }}
              className="rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors"
              style={{
                fontFamily: geist,
                color: active ? "var(--assignment-cta-text)" : "var(--muted-foreground)",
                background: active ? "var(--assignment-cta-bg-strong)" : "transparent",
                boxShadow: active ? "var(--assignment-cta-elevated-shadow)" : undefined,
              }}
            >
              {item}
            </button>
          );
        })}
      </div>

      {/* Practice only serves a student from their own school's question bank,
          so coverage has to be read per school before a rollout decision. */}
      {view === "coverage" && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label
            htmlFor="school-scope"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
          >
            <SchoolIcon className="h-4 w-4" /> Question bank
          </label>
          <select
            id="school-scope"
            value={schoolId}
            onChange={(event) => setSchoolId(event.target.value)}
            className="h-10 rounded-full px-4 text-sm font-semibold"
            style={{
              fontFamily: geist,
              color: "var(--assignment-row-cta-text)",
              background: "var(--assignment-row-cta-bg)",
              border: "1.5px solid var(--assignment-row-cta-border)",
            }}
          >
            <option value={ALL_SCHOOLS}>All schools (combined)</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
          {schoolId === ALL_SCHOOLS && (
            <span className="text-sm text-muted-foreground">
              Adaptive Practice is enabled per school. Select one to validate or enable a standard.
            </span>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-2xl px-4 py-3 text-sm"
          style={{ color: "var(--error, #b45309)", background: "rgb(180 83 9 / 0.1)", border: "1px solid rgb(180 83 9 / 0.24)" }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-56 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading coverage…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl px-6 py-16 text-center text-sm text-muted-foreground" style={glassCard}>
          No records match this view.
        </div>
      ) : view === "coverage" ? (
        <CoverageList
          rows={rows}
          busyKey={busyKey}
          command={command}
          schoolId={schoolId}
          schoolName={schools.find((school) => school.id === schoolId)?.name ?? "this school"}
        />
      ) : view === "runs" ? (
        <RunsList rows={rows} busyKey={busyKey} command={command} />
      ) : (
        <ExceptionsList
          rows={rows}
          kcs={kcs}
          busyKey={busyKey}
          command={command}
          selectedKc={selectedKc}
          setSelectedKc={setSelectedKc}
        />
      )}
    </main>
  );
}

// One KC, with how many eligible Self Practice questions it has in each
// format. Missing a format entirely means Mixed self-practice can land on
// this KC and have no question for the slot it needs (e.g. the pattern calls
// for an SAQ but only MCQs are mapped here); having exactly one of a format
// means it has nothing to rotate to within that format once answered.
function KcChip({ kc }: { kc: KcBreakdown }) {
  const missingFormat = kc.mcqCount === 0 || kc.saqCount === 0;
  const thin = !missingFormat && (kc.mcqCount === 1 || kc.saqCount === 1);
  const tone = missingFormat ? "empty" : thin ? "thin" : "ok";
  const styles: Record<typeof tone, React.CSSProperties> = {
    empty: { color: "var(--assignment-overdue)", background: "rgb(180 83 9 / 0.12)" },
    thin: { color: "var(--assignment-overdue)", background: "rgb(180 83 9 / 0.06)" },
    ok: { color: "var(--muted-foreground)", background: "rgb(100 116 139 / 0.1)" },
  };
  return (
    <span
      title={kc.statement || undefined}
      className="inline-flex items-center gap-2 rounded-full px-3 py-1"
      style={{ fontSize: 13, fontWeight: 600, fontFamily: geist, ...styles[tone] }}
    >
      <span>{kc.code}</span>
      <span style={{ fontWeight: 700, opacity: kc.mcqCount === 0 ? 1 : 0.85 }}>MCQ {kc.mcqCount}</span>
      <span style={{ fontWeight: 700, opacity: kc.saqCount === 0 ? 1 : 0.85 }}>SAQ {kc.saqCount}</span>
    </span>
  );
}

function KcBreakdownPanel({ kcs }: { kcs: KcBreakdown[] }) {
  if (kcs.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        No active Knowledge Components for this standard.
      </p>
    );
  }
  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--assignment-glass-border)" }}>
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Eligible MCQ / SAQ questions per KC
      </p>
      <div className="flex flex-wrap gap-2">
        {kcs.map((kc) => (
          <KcChip key={kc.code} kc={kc} />
        ))}
      </div>
    </div>
  );
}

function CoverageList({
  rows,
  busyKey,
  command,
  schoolId,
  schoolName,
}: {
  rows: ApiRow[];
  busyKey: string | null;
  command: (key: string, body: Record<string, unknown>, confirmation: string) => void;
  schoolId: string;
  schoolName: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const standardId = text(row.standardId);
        // A rollout belongs to a school. Without one selected there is no single
        // status to show and nothing safe to enable, so report the spread.
        const scoped = Boolean(schoolId);
        const status = scoped ? text(row.rolloutStatus) : "—";
        const enabled = scoped && status === "enabled";
        const enabledSchools = num(row.enabledSchoolCount);
        const schoolCount = num(row.schoolCount);
        const unresolved = num(row.unresolvedCount);
        const emptyKcs = num(row.emptyKcCount);
        const missingFormatKcs = num(row.missingFormatKcCount);
        const thinKcs = num(row.thinKcCount);
        const kcs = kcBreakdown(row.kcs);
        const open = expanded[standardId] ?? false;
        return (
          <div key={standardId} className="rounded-2xl px-5 py-4 sm:px-6" style={glassCard}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-shrink-0 items-center gap-2">
                <span
                  className="whitespace-nowrap text-slate-gray"
                  style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, fontFamily: geist }}
                >
                  {standardId}
                </span>
                {scoped ? (
                  <StatusPill label={status} tone={enabled ? "ok" : "neutral"} />
                ) : (
                  <StatusPill
                    label={`${enabledSchools}/${schoolCount} schools enabled`}
                    tone={enabledSchools > 0 ? "ok" : "neutral"}
                  />
                )}
              </div>
              {/* Fixed number of stats, always in one row — flex-nowrap keeps
                  the last metric from orphaning onto its own line; on narrow
                  viewports the whole row already stacks via lg:flex-row above. */}
              <div className="flex flex-shrink-0 flex-nowrap items-center gap-x-4">
                <Metric label="Questions" value={text(row.questionCount)} />
                <Metric label="Self Practice" value={text(row.selfPracticeCount)} />
                <Metric label="Valid" value={text(row.validCount)} tone="ok" />
                <Metric label="Unresolved" value={text(row.unresolvedCount)} tone={unresolved > 0 ? "warn" : undefined} />
                <Metric
                  label="KC coverage"
                  value={`${text(row.coveredKcCount)} / ${text(row.activeKcCount)}`}
                  tone={emptyKcs > 0 || missingFormatKcs > 0 ? "warn" : thinKcs > 0 ? undefined : "ok"}
                />
              </div>
              <div className="flex flex-shrink-0 gap-1.5">
                <ActionButton
                  dense
                  onClick={() => setExpanded((prev) => ({ ...prev, [standardId]: !open }))}
                  title={open ? "Hide per-KC breakdown" : "Show per-KC breakdown"}
                >
                  {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} KCs
                </ActionButton>
                <ActionButton
                  dense
                  onClick={() =>
                    command(
                      standardId,
                      { action: "validate_standard", schoolId, standardId },
                      `Validate coverage for ${standardId} at ${schoolName}?`,
                    )
                  }
                  disabled={!scoped || busyKey === standardId}
                  title={scoped ? "Validate coverage" : "Select a school first"}
                >
                  <CheckCircle2 className="h-4 w-4" /> Validate
                </ActionButton>
                <ActionButton
                  dense
                  variant={enabled ? "danger" : "primary"}
                  onClick={() =>
                    command(
                      standardId,
                      { action: enabled ? "disable_standard" : "enable_standard", schoolId, standardId },
                      `${enabled ? "Disable" : "Enable"} adaptive Practice for ${standardId} at ${schoolName}?`,
                    )
                  }
                  disabled={!scoped || busyKey === standardId}
                  title={
                    scoped
                      ? enabled
                        ? "Disable adaptive Practice"
                        : "Enable adaptive Practice"
                      : "Select a school first"
                  }
                >
                  <Power className="h-4 w-4" /> {enabled ? "Disable" : "Enable"}
                </ActionButton>
              </div>
            </div>
            {open && <KcBreakdownPanel kcs={kcs} />}
          </div>
        );
      })}
    </div>
  );
}

function RunsList({
  rows,
  busyKey,
  command,
}: {
  rows: ApiRow[];
  busyKey: string | null;
  command: (key: string, body: Record<string, unknown>, confirmation: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const id = text(row.id);
        const status = text(row.status);
        const tokens = num(row.input_tokens) + num(row.output_tokens);
        return (
          <div key={id} className="rounded-2xl px-5 py-4 sm:px-6" style={glassCard}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="truncate font-mono text-xs text-muted-foreground" title={id}>
                  {id}
                </span>
                <StatusPill label={status} tone={status === "published" ? "ok" : status === "failed" ? "warn" : "neutral"} />
              </div>
              <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
                <Metric label="Targeted" value={text(row.target_count)} />
                <Metric label="Agreed" value={text(row.agreement_count)} tone="ok" />
                <Metric label="Errors" value={text(row.error_count)} tone={num(row.error_count) > 0 ? "warn" : undefined} />
                <Metric label="Tokens" value={tokens.toLocaleString()} />
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <ActionButton
                  variant="primary"
                  onClick={() => command(id, { action: "publish_run", runId: id }, "Publish all valid agreeing mappings from this run?")}
                  disabled={busyKey === id}
                  title="Publish agreed mappings"
                >
                  <Upload className="h-4 w-4" /> Publish
                </ActionButton>
                <ActionButton
                  variant="danger"
                  onClick={() => command(id, { action: "rollback_run", runId: id }, "Roll back all active mappings published by this run?")}
                  disabled={busyKey === id}
                  title="Roll back run"
                >
                  <RotateCcw className="h-4 w-4" /> Roll back
                </ActionButton>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExceptionsList({
  rows,
  kcs,
  busyKey,
  command,
  selectedKc,
  setSelectedKc,
}: {
  rows: ApiRow[];
  kcs: Record<string, Kc[]>;
  busyKey: string | null;
  command: (key: string, body: Record<string, unknown>, confirmation: string) => void;
  selectedKc: Record<string, string>;
  setSelectedKc: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const rowId = text(row.id);
        const questionSetId = text(row.question_set_id);
        const questionId = text(row.question_id);
        const standardId = row.standard_id ? String(row.standard_id) : null;
        const outcome = text(row.outcome);
        const coverageState = text(row.coverage_state);
        const key = `${questionSetId}/${questionId}`;
        const options = standardId ? kcs[standardId] ?? [] : [];
        const resolved = coverageState === "valid";
        // Only 'invalid' means an open (bad/stale) mapping actually exists to clear.
        // A plain 'unresolved' item was never mapped, so there is nothing to withdraw.
        const hasClearableMapping = coverageState === "invalid";
        const chosen = selectedKc[key] ?? "";
        const busy = busyKey === key;
        const questionText = typeof row.question_text === "string" ? row.question_text : null;
        const questionOptions = Array.isArray(row.question_options)
          ? (row.question_options as Array<{ id: string; text: string }>)
          : [];
        const correctOptionId = typeof row.question_correct_option_id === "string" ? row.question_correct_option_id : null;
        const editHref = `/content/questions/${encodeURIComponent(questionSetId)}?edit=${encodeURIComponent(questionId)}`;

        return (
          <div key={rowId} className="rounded-2xl px-5 py-4 sm:px-6" style={glassCard}>
            {/* Row header */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{questionId}</span>
              {standardId && <StatusPill label={standardId} tone="neutral" />}
              <StatusPill label={outcome} tone={outcome === "invalid" ? "warn" : "neutral"} />
              <StatusPill label={coverageState} tone={resolved ? "ok" : "warn"} />
              {Boolean(row.model_id) && (
                <span className="text-xs text-muted-foreground">via {text(row.model_id)}</span>
              )}
              <Link
                href={editHref}
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                title="Open this question in Question Manager to edit its text, standard, or options"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit question
              </Link>
            </div>

            {/* Question content — the classifier's rationale alone isn't enough
                context to judge whether a KC assignment is correct. */}
            {questionText && (
              <div
                className="mt-3 rounded-xl px-4 py-3"
                style={{ background: "var(--assignment-search-bg)", border: "1px solid var(--border-subtle)" }}
              >
                <p className="text-sm text-foreground">{questionText}</p>
                {questionOptions.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {questionOptions.map((option) => (
                      <li
                        key={option.id}
                        className="text-sm"
                        style={{
                          color: option.id === correctOptionId ? "var(--assignment-completed)" : "var(--muted-foreground)",
                          fontWeight: option.id === correctOptionId ? 600 : 400,
                        }}
                      >
                        {option.id}. {option.text}
                        {option.id === correctOptionId && " ✓"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Rationale / error */}
            <p className="mt-2 text-sm text-muted-foreground">
              {text(row.rationale ?? row.error_code)}
            </p>

            {/* Resolve control */}
            {resolved ? (
              <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--assignment-completed)" }}>
                <BadgeCheck className="h-4 w-4" /> A confirmed KC is already assigned.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center" style={{ borderColor: "var(--border-subtle)" }}>
                {options.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active KCs available for this standard. If the standard itself looks
                    wrong for this question, use &ldquo;Edit question&rdquo; to correct it first.
                  </p>
                ) : (
                  <>
                    <label className="sr-only" htmlFor={`kc-${rowId}`}>
                      Knowledge Component for {questionId}
                    </label>
                    <select
                      id={`kc-${rowId}`}
                      value={chosen}
                      onChange={(event) => setSelectedKc((prev) => ({ ...prev, [key]: event.target.value }))}
                      disabled={busy}
                      className="h-10 min-w-0 flex-1 rounded-xl px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      style={{ background: "var(--assignment-search-bg)", border: "1px solid var(--assignment-search-border)", fontFamily: geist }}
                    >
                      <option value="">Select a Knowledge Component…</option>
                      {options.map((kc) => (
                        <option key={kc.code} value={kc.code}>
                          {kc.code} — {kc.statement.length > 90 ? `${kc.statement.slice(0, 90)}…` : kc.statement}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-shrink-0 gap-2">
                      <ActionButton
                        variant="primary"
                        disabled={busy || !chosen}
                        title="Assign this KC"
                        onClick={() =>
                          command(
                            key,
                            { action: "replace_mapping", questionSetId, questionId, partLabel: null, kcCode: chosen },
                            `Assign KC ${chosen} to question ${questionId}? This disables the standard until it is re-validated.`,
                          )
                        }
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Assign
                      </ActionButton>
                    </div>
                  </>
                )}
                {hasClearableMapping && (
                  <ActionButton
                    variant="secondary"
                    disabled={busy}
                    title="Close the current invalid/stale mapping without assigning a new one"
                    onClick={() =>
                      command(
                        key,
                        { action: "withdraw_mapping", questionSetId, questionId, partLabel: null },
                        `Clear the invalid mapping for question ${questionId}? It will be removed from Self Practice until a new KC is assigned.`,
                      )
                    }
                  >
                    <X className="h-4 w-4" /> Clear invalid mapping
                  </ActionButton>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
