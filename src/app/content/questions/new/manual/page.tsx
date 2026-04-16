"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Question } from "@/types/question";
import { MODULES } from "@/types/question";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { assertSetNameUniqueForSchools } from "@/lib/generated-set-naming";
import { addGeneratedQuestionSet } from "@/lib/question-storage";
import { getDefaultStandardForTopic } from "@/lib/standards";

type SchoolOption = { id: string; name: string };

function makeOptionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ManualQuestionSetPage() {
  const router = useRouter();
  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([]);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);
  const [setName, setSetName] = useState("");
  const [moduleId, setModuleId] = useState<number>(1);
  const [topic, setTopic] = useState<string>(MODULES[0].topics[0]);
  const [questionText, setQuestionText] = useState("");
  const [optionTexts, setOptionTexts] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
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
      const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) setSelectedSchoolIds(ids);
    }
  }, []);

  useEffect(() => {
    const mod = MODULES.find((m) => m.id === moduleId);
    const topics = mod?.topics;
    if (!topics?.length) return;
    if (!topics.some((t) => t === topic)) {
      setTopic(topics[0]);
    }
  }, [moduleId, topic]);

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
    const trimmedStem = questionText.trim();
    if (!trimmedStem) {
      setError("Enter the question text.");
      return;
    }
    const opts = optionTexts.map((t) => t.trim()).filter(Boolean);
    if (opts.length < 2) {
      setError("Enter at least two answer choices.");
      return;
    }
    if (correctIndex < 0 || correctIndex >= opts.length) {
      setError("Select a valid correct answer.");
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

    const optionIds = opts.map(() => makeOptionId());
    const correctOptionId = optionIds[correctIndex] ?? optionIds[0];
    const standard = getDefaultStandardForTopic(topic);

    const q: Question = {
      id: makeOptionId(),
      module: moduleId,
      topic,
      standardId: standard.id,
      standardLabel: standard.label,
      text: trimmedStem,
      imageUrl: null,
      options: opts.map((text, i) => ({
        id: optionIds[i] ?? makeOptionId(),
        text,
      })),
      correctOptionId,
      explanation: "",
      source: "manual",
      dok: 1,
      isVisible: true,
    };

    setSaving(true);
    try {
      const generatedAt = new Date().toISOString();
      const setId = await addGeneratedQuestionSet([q], name, generatedAt, {
        schoolLinks: selectedSchoolIds.map((schoolId) => ({
          schoolId,
          availableForSelfPractice: false,
        })),
      });
      router.push(`/content/questions/${encodeURIComponent(setId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const topicChoices =
    MODULES.find((m) => m.id === moduleId)?.topics ?? MODULES[0].topics;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
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
        Create a single multiple-choice question. You can add more questions
        from the set detail page after saving.
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

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-gray">Module</span>
              <select
                value={moduleId}
                onChange={(e) => setModuleId(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 border border-slate-gray/20 rounded-lg"
              >
                {MODULES.map((m) => (
                  <option key={m.id} value={m.id}>
                    Module {m.id === 1 ? "A" : "B"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-gray">Topic</span>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-gray/20 rounded-lg"
              >
                {topicChoices.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-medium text-slate-gray">Question</h2>
          <label className="block">
            <span className="text-sm font-medium text-slate-gray">Stem *</span>
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              rows={4}
              className="mt-1 w-full px-3 py-2 border border-slate-gray/20 rounded-lg"
            />
          </label>

          <div className="space-y-2">
            <span className="text-sm font-medium text-slate-gray">Choices *</span>
            {optionTexts.map((text, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={correctIndex === i}
                  onChange={() => setCorrectIndex(i)}
                  className="text-[#16a34a]"
                />
                <input
                  type="text"
                  value={text}
                  onChange={(e) => {
                    setOptionTexts((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    });
                  }}
                  className="flex-1 px-3 py-2 border border-slate-gray/20 rounded-lg text-sm"
                  placeholder={`Option ${i + 1}`}
                />
              </div>
            ))}
          </div>
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
