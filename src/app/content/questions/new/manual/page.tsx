"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  ManualQuestionEditor,
  manualDraftToQuestion,
  type ManualQuestionDraft,
} from "@/components/assignments/ManualQuestionEditor";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { assertSetNameUniqueForSchools } from "@/lib/generated-set-naming";
import { addGeneratedQuestionSet } from "@/lib/question-storage";

type SchoolOption = { id: string; name: string };

export default function ManualQuestionSetPage() {
  const router = useRouter();
  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([]);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);
  const [setName, setSetName] = useState("");
  const [manualDrafts, setManualDrafts] = useState<ManualQuestionDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSchools() {
      try {
        const res = await fetch("/api/teacher/schools");
        if (!res.ok) return;
        const data = (await res.json()) as { schools: SchoolOption[] };
        setSchoolOptions(data.schools ?? []);
      } catch {
        // ignore
      }
    }
    void loadSchools();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("schoolIds");
    if (raw) {
      const ids = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 0) setSelectedSchoolIds(ids);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = setName.trim();
    if (!name) {
      setError("Enter a question set name.");
      return;
    }
    if (selectedSchoolIds.length === 0) {
      setError("Select at least one school.");
      return;
    }
    if (manualDrafts.length === 0) {
      setError("Add at least one manually authored question.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const dup = await assertSetNameUniqueForSchools(
      supabase,
      name,
      selectedSchoolIds,
    );
    if (!dup.ok) {
      setError(dup.message);
      return;
    }

    setSaving(true);
    try {
      const questions = manualDrafts.map((draft, index) =>
        manualDraftToQuestion(draft, index),
      );

      const generatedAt = new Date().toISOString();
      const setId = await addGeneratedQuestionSet(questions, name, generatedAt, {
        schoolLinks: selectedSchoolIds.map((schoolId) => ({ schoolId })),
      });
      router.push(`/content/questions/${encodeURIComponent(setId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <Link
        href="/content/questions"
        className="inline-flex items-center gap-2 text-base font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-6"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
          <ArrowLeft className="w-4 h-4 text-[#14532d]" />
        </span>
        Back to Question Manager
      </Link>

      <h1 className="text-xl font-bold text-slate-gray mb-2">
        Add manual question set
      </h1>
      <p className="text-sm text-slate-gray/70 mb-6">
        Create one or more manual questions. This editor matches the assignment
        manual question flow, including Fill with AI.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-medium text-slate-gray">Schools *</h2>
          {schoolOptions.length === 0 ? (
            <p className="text-sm text-amber-700">Loading schools…</p>
          ) : (
            <ul className="space-y-2">
              {schoolOptions.map((school) => (
                <li key={school.id}>
                  <label className="flex items-center gap-2 text-sm text-slate-gray">
                    <input
                      type="checkbox"
                      checked={selectedSchoolIds.includes(school.id)}
                      onChange={() => {
                        setSelectedSchoolIds((prev) =>
                          prev.includes(school.id)
                            ? prev.filter((id) => id !== school.id)
                            : [...prev, school.id],
                        );
                      }}
                      className="rounded border-slate-gray/30 text-[#16a34a]"
                    />
                    {school.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-gray">Set name *</span>
            <input
              type="text"
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-gray/20 rounded-lg"
              placeholder="e.g., Week 3 review"
            />
          </label>
        </section>

        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-medium text-slate-gray">Questions</h2>
          <ManualQuestionEditor drafts={manualDrafts} onChange={setManualDrafts} />
        </section>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#16a34a] text-white font-medium hover:bg-[#15803d] disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save question set"
          )}
        </button>
      </form>
    </main>
  );
}
