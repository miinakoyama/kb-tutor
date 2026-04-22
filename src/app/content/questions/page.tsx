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
  Eye,
} from "lucide-react";
import type { QuestionSet, QuestionSource } from "@/types/question";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchQuestionSetsForSchool,
  deleteSchoolQuestionSetLink,
  type SchoolQuestionSetRow,
} from "@/lib/school-generated-questions";
import { deleteGeneratedQuestionSet } from "@/lib/question-storage";

type SchoolOption = { id: string; name: string };

export default function QuestionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [rows, setRows] = useState<SchoolQuestionSetRow[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [loadingSets, setLoadingSets] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
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
      const supabase = getSupabaseBrowserClient();
      const result = await fetchQuestionSetsForSchool(supabase, selectedSchoolId);
      if (result.error) {
        setError(result.error);
        setRows([]);
      } else {
        setRows(result.rows);
      }
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

  const questionSetList: QuestionSet[] = useMemo(
    () =>
      rows.map((r) => ({
        id: r.setId,
        name: r.setName,
        source: "generated" as QuestionSource,
        createdAt: r.generatedAt,
        questionIds: [],
        generationModelId: r.generationModelId,
        generationModelLabel: r.generationModelLabel,
      })),
    [rows],
  );

  const filteredSets = useMemo(() => {
    const base = questionSetList;
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter((s) => s.name.toLowerCase().includes(q));
  }, [questionSetList, searchQuery]);

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

  const totalQuestionCount = rows.length;

  const getSourceIcon = (source: QuestionSource) => {
    switch (source) {
      case "manual":
        return <FileText className="w-5 h-5 text-slate-gray/70" />;
      case "imported":
        return <FileText className="w-5 h-5 text-slate-gray/70" />;
      case "generated":
        return <Sparkles className="w-5 h-5 text-[#16a34a]" />;
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
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex justify-center">
        <Loader2 className="w-8 h-8 text-[#16a34a] animate-spin" />
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <Link
        href="/content"
        className="inline-flex items-center gap-2 text-base font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-6"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
          <ArrowLeft className="w-4 h-4 text-[#14532d]" />
        </span>
        Back to Content Management
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-gray">Question Manager</h1>
          <p className="text-sm text-slate-gray/70">
            {selectedSchoolId
              ? `${totalQuestionCount} set(s) for the selected school`
              : "Select a school"}
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddMenuOpen((o) => !o)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-[#16a34a] hover:bg-[#15803d] transition-colors"
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
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg z-20 py-1">
                <Link
                  href={
                    selectedSchoolId
                      ? `/content/mass-production?schoolIds=${encodeURIComponent(selectedSchoolId)}`
                      : "/content/mass-production"
                  }
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-gray hover:bg-[#16a34a]/10"
                  onClick={() => setAddMenuOpen(false)}
                >
                  <Sparkles className="w-4 h-4 text-[#16a34a]" />
                  Generate with AI
                </Link>
                <Link
                  href={
                    selectedSchoolId
                      ? `/content/questions/new/manual?schoolIds=${encodeURIComponent(selectedSchoolId)}`
                      : "/content/questions/new/manual"
                  }
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-gray hover:bg-[#16a34a]/10"
                  onClick={() => setAddMenuOpen(false)}
                >
                  <FileText className="w-4 h-4 text-[#16a34a]" />
                  Add manually
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
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
            className="min-w-[220px] border border-slate-gray/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50"
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-gray/40" />
          <input
            type="text"
            placeholder="Search question sets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 text-sm"
          />
        </div>
      </div>

      {loadingSets ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-[#16a34a] animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSets.map((set) => {
            return (
              <div
                key={set.id}
                className="rounded-xl border border-[#16a34a]/30 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <Link
                    href={`/content/questions/${encodeURIComponent(set.id)}`}
                    className="flex items-center gap-4 flex-1 min-w-0 group"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0">
                      {getSourceIcon(set.source)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-medium text-slate-gray group-hover:text-[#16a34a] transition-colors truncate">
                        {set.name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <span className="text-xs text-[#16a34a] bg-[#16a34a]/10 px-2 py-0.5 rounded">
                          {getSourceLabel(set.source)}
                        </span>
                        {set.createdAt && (
                          <span className="text-xs text-slate-gray/50">
                            {new Date(set.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-gray/30 group-hover:text-[#16a34a] shrink-0" />
                  </Link>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <Link
                      href={`/preview/${encodeURIComponent(set.id)}?mode=practice`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#166534] hover:text-[#14532d] px-2 py-1 rounded-md hover:bg-[#16a34a]/10 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Preview
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => void handleRemoveFromSchool(e, set.id)}
                      className="text-xs font-medium text-slate-gray hover:text-red-600 px-2 py-1"
                    >
                      Remove from school
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void handleDeleteSetEverywhere(e, set.id)}
                      className="p-2 rounded-lg text-slate-gray/40 hover:text-red-500 hover:bg-red-50"
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
              <p className="text-slate-gray/60 mb-4">
                {searchQuery
                  ? "No question sets found matching your search."
                  : "No question sets linked to this school yet."}
              </p>
              <p className="text-sm text-slate-gray/50 mb-4">
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
