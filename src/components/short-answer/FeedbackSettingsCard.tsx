"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquareText, RotateCcw } from "lucide-react";
import type { GradingMethod } from "@/types/short-answer";
import { Button } from "@/components/ui/Button";

interface ModelInfo {
  id: string;
  label: string;
  provider: string;
}

interface MethodInfo {
  method: GradingMethod;
  label: string;
  recommended: { modelId: string; temperature: number };
}

interface Config {
  method: GradingMethod;
  modelId: string;
  temperature: number;
}

interface SchoolSetting {
  schoolId: string;
  schoolName: string;
  setting: Config | null;
  inherited: boolean;
}

interface SettingsResponse {
  methods: MethodInfo[];
  models: ModelInfo[];
  default: Config & { editable: boolean };
  schools: SchoolSetting[];
}

interface DraftState extends Config {
  saving: boolean;
  message: string | null;
  error: string | null;
}

function draftFromConfig(config: Config): DraftState {
  return { ...config, saving: false, message: null, error: null };
}

export function FeedbackSettingsCard() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/feedback-settings", { cache: "no-store" });
      if (res.status === 403 || res.status === 401) {
        setData(null);
        setLoadError("You do not have access to feedback settings.");
        return;
      }
      if (!res.ok) throw new Error("Failed to load feedback settings.");
      const json = (await res.json()) as SettingsResponse;
      setData(json);
      const next: Record<string, DraftState> = {
        default: draftFromConfig(json.default),
      };
      for (const school of json.schools) {
        next[school.schoolId] = draftFromConfig(school.setting ?? json.default);
      }
      setDrafts(next);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDraft = (key: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleMethodChange = (key: string, method: GradingMethod) => {
    const recommended = data?.methods.find((m) => m.method === method)?.recommended;
    updateDraft(key, {
      method,
      modelId: recommended?.modelId ?? drafts[key].modelId,
      temperature: recommended?.temperature ?? drafts[key].temperature,
      message: null,
      error: null,
    });
  };

  const save = async (
    key: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    updateDraft(key, { saving: true, message: null, error: null });
    try {
      const res = await fetch("/api/feedback-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to save.");
      }
      updateDraft(key, { saving: false, message: successMessage });
      await load();
    } catch (err) {
      updateDraft(key, {
        saving: false,
        error: err instanceof Error ? err.message : "Failed to save.",
      });
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-6 shadow-[var(--assignment-card-shadow)]">
        <div className="flex items-center gap-2 text-sm text-slate-gray/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading feedback settings...
        </div>
      </section>
    );
  }

  if (loadError || !data) {
    return (
      <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-6 shadow-[var(--assignment-card-shadow)]">
        <p className="text-sm text-slate-gray/70">
          {loadError ?? "Feedback settings are unavailable."}
        </p>
      </section>
    );
  }

  const renderControls = (key: string, isDefaultRow: boolean) => {
    const draft = drafts[key];
    if (!draft) return null;
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="text-sm text-slate-gray">
          <span className="block mb-1 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
            Method
          </span>
          <select
            value={draft.method}
            onChange={(e) => handleMethodChange(key, e.target.value as GradingMethod)}
            className="min-w-64 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-slate-gray focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {data.methods.map((m) => (
              <option key={m.method} value={m.method}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-gray">
          <span className="block mb-1 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
            Model
          </span>
          <select
            value={draft.modelId}
            onChange={(e) =>
              updateDraft(key, { modelId: e.target.value, message: null, error: null })
            }
            className="min-w-48 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-slate-gray focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {data.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-gray">
          <span className="block mb-1 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
            Temperature
          </span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={draft.temperature}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              updateDraft(key, {
                temperature: Number.isNaN(value) ? 0 : Math.max(0, Math.min(2, value)),
                message: null,
                error: null,
              });
            }}
            className="w-24 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-slate-gray focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div className="flex items-center gap-2">
          <Button
            disabled={draft.saving}
            onClick={() =>
              save(
                key,
                isDefaultRow
                  ? {
                      scope: "default",
                      method: draft.method,
                      modelId: draft.modelId,
                      temperature: draft.temperature,
                    }
                  : {
                      scope: "school",
                      schoolId: key,
                      method: draft.method,
                      modelId: draft.modelId,
                      temperature: draft.temperature,
                    },
                "Saved.",
              )
            }
          >
            {draft.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
          {!isDefaultRow && (
            <Button
              variant="outline"
              disabled={draft.saving}
              onClick={() =>
                save(
                  key,
                  { scope: "school", schoolId: key, reset: true },
                  "Reverted to the default configuration.",
                )
              }
              title="Revert to the system default"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>
        {(draft.message || draft.error) && (
          <p
            className={`w-full text-xs ${draft.error ? "text-rose-600 dark:text-rose-300" : "text-forest"}`}
          >
            {draft.error ?? draft.message}
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)] mb-6">
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-slate-gray tracking-[-0.2px]">
          <MessageSquareText className="h-5 w-5 text-[var(--assignment-completed)]" />
          Short-answer feedback settings
        </h2>
        <p className="mt-1 text-sm text-slate-gray/60">
          Choose which AI grading method and model give students feedback on
          short-answer questions. Changing the method fills in its recommended
          model and temperature; you can override either.
        </p>
      </div>

      <div className="space-y-6 px-5 py-5">
        {data.default.editable && (
          <div className="rounded-xl border border-border-default bg-surface-muted/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-gray">
                System default
              </span>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-gray/70">
                Applies to schools without their own setting
              </span>
            </div>
            {renderControls("default", true)}
          </div>
        )}

        {data.schools.length === 0 ? (
          <p className="text-sm text-slate-gray/60">
            No schools are available for you to configure.
          </p>
        ) : (
          data.schools.map((school) => (
            <div
              key={school.schoolId}
              className="rounded-xl border border-border-default p-4"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-gray">
                  {school.schoolName}
                </span>
                {school.inherited && (
                  <span className="rounded-full bg-[var(--assignment-calendar-nav-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--assignment-completed)]">
                    Following the default
                  </span>
                )}
              </div>
              {renderControls(school.schoolId, false)}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
