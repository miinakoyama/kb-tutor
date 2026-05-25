"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SchoolOption = {
  id: string;
  name: string;
};

interface SchoolFilterProps {
  value: string[];
  onChange: (next: string[]) => void;
}

export function SchoolFilter({ value, onChange }: SchoolFilterProps) {
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedDefaultRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/analytics/schools", {
          cache: "no-store",
          credentials: "include",
        });
        const payload = (await response.json()) as {
          schools?: SchoolOption[];
          error?: string;
        };
        if (!response.ok) {
          if (!cancelled) setError(payload.error ?? "Failed to load schools.");
          return;
        }
        if (!cancelled) setSchools(payload.schools ?? []);
      } catch {
        if (!cancelled) setError("Failed to load schools.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const allSchoolIds = useMemo(() => schools.map((school) => school.id), [schools]);

  useEffect(() => {
    if (initializedDefaultRef.current) return;
    if (loading || error || schools.length === 0) return;
    if (value.length > 0) {
      initializedDefaultRef.current = true;
      return;
    }
    initializedDefaultRef.current = true;
    onChange(allSchoolIds);
  }, [allSchoolIds, error, loading, onChange, schools.length, value.length]);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedCount = value.length;
  const summaryLabel =
    schools.length > 0 && selectedCount === schools.length
      ? "All schools selected"
      : `${selectedCount} of ${schools.length} school${schools.length === 1 ? "" : "s"} selected`;

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      if (selectedSet.has(id)) return;
      onChange([...value, id]);
      return;
    }
    onChange(value.filter((v) => v !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-medium text-slate-gray">Schools</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(allSchoolIds)}
            className="text-xs text-forest hover:underline"
            disabled={schools.length === 0}
          >
            Select all
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border-default bg-surface px-3 py-2">
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading schools...</p>
        ) : error ? (
          <p className="text-xs text-error">{error}</p>
        ) : schools.length === 0 ? (
          <p className="text-xs text-muted-foreground">No schools found.</p>
        ) : (
          <div className="grid gap-1 max-h-28 overflow-auto pr-1">
            {schools.map((school) => {
              const checked = selectedSet.has(school.id);
              return (
                <label
                  key={school.id}
                  className="flex items-center gap-2 text-sm text-slate-gray"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => toggle(school.id, event.target.checked)}
                  />
                  <span>{school.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{summaryLabel}</p>
    </div>
  );
}
