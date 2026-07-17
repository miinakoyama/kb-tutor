"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Search,
  Trash2,
  Plus,
  Sparkles,
  FileText,
  Loader2,
} from "lucide-react";
import type { QuestionSet, QuestionSource } from "@/types/question";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteSchoolQuestionSetLink,
} from "@/lib/school-generated-questions";
import { deleteGeneratedQuestionSet } from "@/lib/question-storage";

type SchoolOption = { id: string; name: string };
type QuestionManagerRow = {
  schoolId: string;
  setId: string;
  setName: string;
  generatedAt: string;
  generationModelId?: string;
  generationModelLabel?: string;
  creatorUserId: string;
  creatorName: string;
  ownedByRequester: boolean;
};

function isManualQuestionSet(row: QuestionManagerRow): boolean {
  if (row.generationModelId === "manual") return true;
  return row.generationModelLabel?.trim().toLowerCase() === "manual";
}

export default function QuestionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [rows, setRows] = useState<QuestionManagerRow[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [loadingSets, setLoadingSets] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [onlyMySets, setOnlyMySets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSchools = useCallback(async () => {
    setLoadingSchools(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/schools");
      if (!res.ok) {
        throw new Error("Failed to load schools");
      }
      const data = (await res.json()) as {
        schools: { id: string; name: string }[];
      };
      const list = data.schools ?? [];
      setSchools(list);
      setSelectedSchoolId((prev) => prev ?? (list[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schools");
    } finally {
      setLoadingSchools(false);
    }
  }, []);

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  const reloadSets = useCallback(async () => {
    if (!selectedSchoolId) {
      setRows([]);
      return;
    }
    setLoadingSets(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/teacher/question-sets?schoolId=${encodeURIComponent(selectedSchoolId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        error?: string;
        rows?: QuestionManagerRow[];
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load sets");
      }
      setRows(payload.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sets");
      setRows([]);
    } finally {
      setLoadingSets(false);
    }
  }, [selectedSchoolId]);

  useEffect(() => {
    void reloadSets();
  }, [reloadSets]);

  const rowBySetId = useMemo(
    () => new Map(rows.map((row) => [row.setId, row])),
    [rows],
  );

  const questionSetList: QuestionSet[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.setId,
        name: r.setName,
        source: isManualQuestionSet(r)
          ? ("manual" as QuestionSource)
          : ("generated" as QuestionSource),
        createdAt: r.generatedAt,
        questionIds: [],
        generationModelId: r.generationModelId,
        generationModelLabel: r.generationModelLabel,
      })),
    [rows],
  );

  const filteredSets = useMemo(() => {
    const base = questionSetList.filter((set) => {
      if (!onlyMySets) return true;
      const row = rowBySetId.get(set.id);
      return row?.ownedByRequester === true;
    });
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter((s) => s.name.toLowerCase().includes(q));
  }, [questionSetList, searchQuery, onlyMySets, rowBySetId]);

  const handleRemoveFromSchool = async (e: React.MouseEvent, setId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedSchoolId) return;
    if (
      !confirm(
        "Remove this question set from the selected school? The set itself is not deleted if it is linked elsewhere.",
      )
    ) {
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const { error: delErr } = await deleteSchoolQuestionSetLink(
      supabase,
      selectedSchoolId,
      setId,
    );
    if (delErr) {
      setError(delErr);
      return;
    }
    await reloadSets();
  };

  const handleDeleteSetEverywhere = async (e: React.MouseEvent, setId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this question set entirely? This cannot be undone.")) {
      return;
    }
    setError(null);
    try {
      await deleteGeneratedQuestionSet(setId);
      await reloadSets();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete the set. You may not have permission, or the set is still linked in a way that blocks deletion.",
      );
    }
  };

  const totalSetCount = rows.length;
  const filteredSetCount = filteredSets.length;

  const getSourceIcon = (source: QuestionSource) => {
    switch (source) {
      case "manual":
        return <FileText className="w-5 h-5 text-muted-foreground" />;
      case "imported":
        return <FileText className="w-5 h-5 text-muted-foreground" />;
      case "generated":
        return <Sparkles className="w-5 h-5 text-[var(--assignment-completed)]" />;
    }
  };

  const getSourceLabel = (source: QuestionSource) => {
    switch (source) {
      case "manual":
        return "Manual";
      case "imported":
        return "Imported";
      case "generated":
        return "AI Generated";
    }
  };

  if (loadingSchools) {
    return (
      <main className="mx-auto flex w-full max-w-[1500px] justify-center px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12">
        <Loader2 className="w-8 h-8 text-[var(--assignment-completed)] animate-spin" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12">
      <Link
        href="/content"
        className="inline-flex items-center gap-2 text-base font-semibold text-heading hover:text-forest transition-colors mb-6"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--assignment-calendar-nav-bg)]">
          <ArrowLeft className="w-4 h-4 text-heading" />
        </span>
        Back to Content Management
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-xl font-bold text-slate-gray tracking-[-0.4px]">Question Manager</h1>
          <p className="text-sm text-muted-foreground">
            {selectedSchoolId
              ? filteredSetCount !== totalSetCount || searchQuery.trim() || onlyMySets
                ? `Showing ${filteredSetCount} of ${totalSetCount} set(s) for the selected school`
                : `${totalSetCount} set(s) for the selected school`
              : "Select a school"}
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddMenuOpen((o) => !o)}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full font-heading font-bold text-sm transition duration-200 hover:brightness-110 active:brightness-95 border-[1.5px] border-[var(--assignment-glass-border)] bg-[var(--assignment-cta-bg-strong)] text-[var(--assignment-cta-text)] shadow-[var(--assignment-cta-elevated-shadow)]"
          >
            <Plus className="w-4 h-4" />
            Add new
          </button>
          {addMenuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                aria-label="Close menu"
                onClick={() => setAddMenuOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-[var(--assignment-glass-border)] bg-[var(--surface)] py-1 shadow-[var(--assignment-popover-shadow)]">
                <Link
                  href={
                    selectedSchoolId
                      ? `/content/mass-production?schoolIds=${encodeURIComponent(selectedSchoolId)}`
                      : "/content/mass-production"
                  }
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-gray hover:bg-[var(--surface-muted)]"
                  onClick={() => setAddMenuOpen(false)}
                >
                  <Sparkles className="w-4 h-4 text-[var(--assignment-completed)]" />
                  Generate with AI
                </Link>
                <Link
                  href={
                    selectedSchoolId
                      ? `/content/questions/new/manual?schoolIds=${encodeURIComponent(selectedSchoolId)}`
                      : "/content/questions/new/manual"
                  }
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-gray hover:bg-[var(--surface-muted)]"
                  onClick={() => setAddMenuOpen(false)}
                >
                  <FileText className="w-4 h-4 text-[var(--assignment-completed)]" />
                  Add manually
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-error-border bg-error-light px-3.5 py-2.5 text-sm text-error">
          {error}
        </div>
      )}

      <div className="mb-6 flex flex-col sm:flex-row gap-4 sm:items-end">
        <div>
          <label className="block text-sm font-medium text-slate-gray mb-1">
            School
          </label>
          <select
            value={selectedSchoolId ?? ""}
            onChange={(e) => setSelectedSchoolId(e.target.value || null)}
            className="min-w-[220px] rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {schools.length === 0 ? (
              <option value="">No schools available</option>
            ) : (
              schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search question sets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] pl-10 pr-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex h-10 items-center">
          <label className="inline-flex items-center gap-2 text-sm text-slate-gray">
            <input
              type="checkbox"
              checked={onlyMySets}
              onChange={(e) => setOnlyMySets(e.target.checked)}
              className="rounded border-border-default accent-[var(--assignment-completed)]"
            />
            Show only my sets
          </label>
        </div>
      </div>

      {loadingSets ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-[var(--assignment-completed)] animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSets.map((set) => {
            const row = rowBySetId.get(set.id);
            return (
              <div
                key={set.id}
                className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-4 shadow-[var(--assignment-card-shadow)]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <Link
                    href={
                      selectedSchoolId
                        ? `/content/questions/${encodeURIComponent(set.id)}?schoolId=${encodeURIComponent(selectedSchoolId)}`
                        : `/content/questions/${encodeURIComponent(set.id)}`
                    }
                    className="flex items-center gap-4 flex-1 min-w-0 group"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0">
                      {getSourceIcon(set.source)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-medium text-slate-gray group-hover:text-[var(--assignment-completed)] transition-colors truncate">
                        {set.name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <span className="text-xs text-[var(--assignment-completed)] bg-[var(--assignment-calendar-nav-bg)] px-2 py-0.5 rounded">
                          {getSourceLabel(set.source)}
                        </span>
                        {set.createdAt && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(set.createdAt).toLocaleDateString()}
                          </span>
                        )}
                        {row && (
                          <span className="text-xs text-muted-foreground">
                            Created by: {row.creatorName}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-gray/30 group-hover:text-[var(--assignment-completed)] shrink-0" />
                  </Link>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <button
                      type="button"
                      onClick={(e) => void handleRemoveFromSchool(e, set.id)}
                      className="text-xs font-medium text-slate-gray hover:text-error px-2 py-1"
                    >
                      Remove from school
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void handleDeleteSetEverywhere(e, set.id)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-error-light"
                      title="Delete set entirely"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredSets.length === 0 && selectedSchoolId && (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "No question sets found matching your search."
                  : onlyMySets
                    ? "No question sets created by you match this view."
                  : "No question sets linked to this school yet."}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Use Add new to generate with AI or add questions manually, and
                select this school when saving.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
