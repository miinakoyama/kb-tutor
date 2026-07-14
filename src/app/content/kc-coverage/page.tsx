"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Loader2,
  Pencil,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

type View = "coverage" | "runs" | "exceptions";
type ApiRow = Record<string, unknown>;
type Kc = { code: string; statement: string };

function text(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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
    <div className="flex flex-col">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className="text-slate-gray"
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
      className="inline-flex items-center rounded-full px-3 py-1 capitalize"
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
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  title?: string;
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
      className="inline-flex h-10 items-center justify-center gap-2 px-4 text-sm font-semibold transition duration-200 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/kc-coverage?view=${view}&limit=100`, { cache: "no-store" });
      const payload = (await response.json()) as { rows?: ApiRow[]; kcs?: Record<string, Kc[]>; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load KC coverage");
      setRows(payload.rows ?? []);
      setKcs(payload.kcs ?? {});
    } catch (loadError) {
      setRows([]);
      setKcs({});
      setError(loadError instanceof Error ? loadError.message : "Unable to load KC coverage");
    } finally {
      setLoading(false);
    }
  }, [view]);

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
    <main className="mx-auto w-full px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-10" style={{ maxWidth: 1180 }}>
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
        <CoverageList rows={rows} busyKey={busyKey} command={command} />
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

function CoverageList({
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
        const standardId = text(row.standardId);
        const status = text(row.rolloutStatus);
        const enabled = status === "enabled";
        const unresolved = num(row.unresolvedCount);
        return (
          <div key={standardId} className="rounded-2xl px-5 py-4 sm:px-6" style={glassCard}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span
                  className="text-slate-gray"
                  style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, fontFamily: geist }}
                >
                  {standardId}
                </span>
                <StatusPill label={status} tone={enabled ? "ok" : "neutral"} />
              </div>
              <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
                <Metric label="Questions" value={text(row.questionCount)} />
                <Metric label="Self Practice" value={text(row.selfPracticeCount)} />
                <Metric label="Valid" value={text(row.validCount)} tone="ok" />
                <Metric label="Unresolved" value={text(row.unresolvedCount)} tone={unresolved > 0 ? "warn" : undefined} />
                <Metric label="KC coverage" value={`${text(row.coveredKcCount)} / ${text(row.activeKcCount)}`} />
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <ActionButton
                  onClick={() => command(standardId, { action: "validate_standard", standardId }, `Validate coverage for ${standardId}?`)}
                  disabled={busyKey === standardId}
                  title="Validate coverage"
                >
                  <CheckCircle2 className="h-4 w-4" /> Validate
                </ActionButton>
                <ActionButton
                  variant={enabled ? "danger" : "primary"}
                  onClick={() =>
                    command(
                      standardId,
                      { action: enabled ? "disable_standard" : "enable_standard", standardId },
                      `${enabled ? "Disable" : "Enable"} adaptive Practice for ${standardId}?`,
                    )
                  }
                  disabled={busyKey === standardId}
                  title={enabled ? "Disable adaptive Practice" : "Enable adaptive Practice"}
                >
                  <Power className="h-4 w-4" /> {enabled ? "Disable" : "Enable"}
                </ActionButton>
              </div>
            </div>
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
