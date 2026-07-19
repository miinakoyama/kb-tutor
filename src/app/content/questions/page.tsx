"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Link2,
  Search,
  Trash2,
  Plus,
  Sparkles,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import type { QuestionSet, QuestionSource } from "@/types/question";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteSchoolQuestionSetLink,
  upsertSchoolQuestionSetLinks,
} from "@/lib/school-generated-questions";
import { assertSetNameUniqueForSchools } from "@/lib/generated-set-naming";
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

type LinkCandidate = {
  id: string;
  name: string;
  generatedAt: string;
  generationModelLabel?: string;
};

function isManualQuestionSet(row: QuestionManagerRow): boolean {
  if (row.generationModelId === "manual") return true;
  return row.generationModelLabel?.trim().toLowerCase() === "manual";
}

export default function QuestionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rows, setRows] = useState<QuestionManagerRow[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [loadingSets, setLoadingSets] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [onlyMySets, setOnlyMySets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkCandidates, setLinkCandidates] = useState<LinkCandidate[] | null>(null);
  const [linkSelected, setLinkSelected] = useState<Record<string, boolean>>({});
  const [linkSearch, setLinkSearch] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkErrors, setLinkErrors] = useState<string[]>([]);

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

  useEffect(() => {
    const loadRole = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          profile?: { role?: string } | null;
          user?: {
            user_metadata?: { role?: string };
            app_metadata?: { role?: string };
          } | null;
        };
        const role =
          payload.profile?.role ??
          payload.user?.user_metadata?.role ??
          payload.user?.app_metadata?.role;
        setIsAdmin(role === "admin");
      } catch {
        setIsAdmin(false);
      }
    };
    void loadRole();
  }, []);

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

  const openLinkModal = async () => {
    setAddMenuOpen(false);
    setLinkModalOpen(true);
    setLinkCandidates(null);
    setLinkSelected({});
    setLinkSearch("");
    setLinkErrors([]);
    const supabase = getSupabaseBrowserClient();
    const { data, error: fetchErr } = await supabase
      .from("generated_question_sets")
      .select("id,name,generated_at,generation_model_label")
      .order("generated_at", { ascending: false });
    if (fetchErr) {
      setLinkErrors([fetchErr.message]);
      setLinkCandidates([]);
      return;
    }
    const linkedIds = new Set(rows.map((row) => row.setId));
    setLinkCandidates(
      (data ?? [])
        .filter((set) => !linkedIds.has(String(set.id)))
        .map((set) => ({
          id: String(set.id),
          name: String(set.name),
          generatedAt: String(set.generated_at),
          generationModelLabel: set.generation_model_label
            ? String(set.generation_model_label)
            : undefined,
        })),
    );
  };

  const handleLinkSelected = async () => {
    if (!selectedSchoolId || linking) return;
    const chosen = (linkCandidates ?? []).filter((set) => linkSelected[set.id]);
    if (chosen.length === 0) return;
    setLinking(true);
    setLinkErrors([]);
    const supabase = getSupabaseBrowserClient();
    const failures: string[] = [];
    let linkedCount = 0;
    for (const set of chosen) {
      const unique = await assertSetNameUniqueForSchools(
        supabase,
        set.name,
        [selectedSchoolId],
        set.id,
      );
      if (!unique.ok) {
        failures.push(`"${set.name}": ${unique.message}`);
        continue;
      }
      const { error: linkErr } = await upsertSchoolQuestionSetLinks(
        supabase,
        set.id,
        [{ schoolId: selectedSchoolId }],
      );
      if (linkErr) {
        failures.push(`"${set.name}": ${linkErr}`);
        continue;
      }
      linkedCount += 1;
    }
    setLinking(false);
    if (linkedCount > 0) {
      await reloadSets();
    }
    if (failures.length > 0) {
      setLinkErrors(failures);
      // Keep only the failed sets checked so the admin can retry or bail out.
      setLinkSelected(
        Object.fromEntries(
          chosen
            .filter((set) => failures.some((message) => message.startsWith(`"${set.name}"`)))
            .map((set) => [set.id, true]),
        ),
      );
      const linkedIds = new Set(chosen.filter((set) => !failures.some((message) => message.startsWith(`"${set.name}"`))).map((set) => set.id));
      setLinkCandidates((prev) => (prev ?? []).filter((set) => !linkedIds.has(set.id)));
    } else {
      setLinkModalOpen(false);
    }
  };

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
                <button
                  type="button"
                  disabled={!selectedSchoolId}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-gray hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void openLinkModal()}
                >
                  <Link2 className="w-4 h-4 text-[var(--assignment-completed)]" />
                  Link existing set
                </button>
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
        {isAdmin && (
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
        )}
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

      {linkModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={() => !linking && setLinkModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Link existing question sets"
            className="relative z-50 flex max-h-[80vh] w-full max-w-xl flex-col rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--surface)] p-6 shadow-[var(--assignment-popover-shadow)]"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-bold text-slate-gray">
                  Link existing set
                </h2>
                <p className="text-sm text-muted-foreground">
                  Attach question sets from other schools to{" "}
                  {schools.find((s) => s.id === selectedSchoolId)?.name ?? "this school"}.
                  Their questions and KC coverage become available immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                disabled={linking}
                className="rounded-lg p-2 text-muted-foreground hover:bg-[var(--surface-muted)] hover:text-foreground"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {linkErrors.length > 0 && (
              <div className="mb-3 rounded-xl border border-error-border bg-error-light px-3.5 py-2.5 text-sm text-error">
                <ul className="list-disc pl-5">
                  {linkErrors.map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search sets..."
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] pl-10 pr-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {linkCandidates === null ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-[var(--assignment-completed)] animate-spin" />
                </div>
              ) : linkCandidates.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No other question sets available to link.
                </p>
              ) : (
                <ul className="space-y-1">
                  {linkCandidates
                    .filter(
                      (set) =>
                        !linkSearch.trim() ||
                        set.name.toLowerCase().includes(linkSearch.toLowerCase()),
                    )
                    .map((set) => (
                      <li key={set.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-[var(--surface-muted)]">
                          <input
                            type="checkbox"
                            checked={linkSelected[set.id] ?? false}
                            disabled={linking}
                            onChange={() =>
                              setLinkSelected((prev) => ({
                                ...prev,
                                [set.id]: !prev[set.id],
                              }))
                            }
                            className="rounded border-border-default accent-[var(--assignment-completed)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-gray">
                              {set.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {new Date(set.generatedAt).toLocaleDateString()}
                              {set.generationModelLabel
                                ? ` · ${set.generationModelLabel}`
                                : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-3 border-t border-border-subtle pt-4">
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                disabled={linking}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleLinkSelected()}
                disabled={
                  linking ||
                  !selectedSchoolId ||
                  !Object.values(linkSelected).some(Boolean)
                }
                className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[var(--assignment-glass-border)] bg-[var(--assignment-cta-bg-strong)] px-5 py-2 font-heading text-sm font-bold text-[var(--assignment-cta-text)] shadow-[var(--assignment-cta-elevated-shadow)] transition duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {linking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
                {linking
                  ? "Linking..."
                  : `Link ${Object.values(linkSelected).filter(Boolean).length} set(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
