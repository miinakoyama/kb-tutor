"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StickyNote, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

const NOTE_PROMPTS = [
  "What do I want to remember or come back to?",
  "How does this connect or conflict with something I already know?",
  "What's confusing me here?",
];

function emptyAnswers(): string[] {
  return NOTE_PROMPTS.map(() => "");
}

function serializeAnswers(answers: string[]): string {
  return NOTE_PROMPTS.map((prompt, index) => {
    const answer = answers[index]?.trim() ?? "";
    return answer ? `${prompt}\n${answer}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

function parseAnswers(text: string): string[] {
  const answers = emptyAnswers();
  const trimmed = text.trim();
  if (!trimmed) return answers;

  let matched = false;
  NOTE_PROMPTS.forEach((prompt, index) => {
    const start = trimmed.indexOf(prompt);
    if (start === -1) return;
    const contentStart = start + prompt.length;
    const nextStarts = NOTE_PROMPTS.map((otherPrompt) =>
      trimmed.indexOf(otherPrompt, contentStart),
    ).filter((pos) => pos !== -1);
    const end = nextStarts.length > 0 ? Math.min(...nextStarts) : trimmed.length;
    answers[index] = trimmed.slice(contentStart, end).trim();
    matched = true;
  });

  if (!matched) {
    answers[0] = trimmed;
  }
  return answers;
}

interface QuestionNoteDrawerProps {
  questionId: string;
  tourId?: string;
}

export function QuestionNoteDrawer({
  questionId,
  tourId,
}: QuestionNoteDrawerProps) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<string[]>(emptyAnswers);
  const [loadedQuestionId, setLoadedQuestionId] = useState<string | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const persist = useCallback(
    async (text: string) => {
      if (!hasSupabaseEnv()) return;
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      if (text.trim().length === 0) {
        await supabase
          .from("student_question_notes")
          .delete()
          .eq("user_id", user.id)
          .eq("question_id", questionId);
        return;
      }

      const { error } = await supabase.from("student_question_notes").upsert(
        {
          user_id: user.id,
          question_id: questionId,
          note_text: text,
        },
        { onConflict: "user_id,question_id" },
      );
      if (!error) {
        setSavedVisible(true);
        window.setTimeout(() => setSavedVisible(false), 1500);
      }
    },
    [questionId],
  );

  const scheduleSave = useCallback(
    (nextAnswers: string[]) => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(
        () => void persist(serializeAnswers(nextAnswers)),
        400,
      );
    },
    [persist],
  );

  useEffect(() => {
    setAnswers(emptyAnswers());
    setLoadedQuestionId(null);
    setSavedVisible(false);
  }, [questionId]);

  useEffect(() => {
    if (!open || loadedQuestionId === questionId) return;
    let cancelled = false;
    void (async () => {
      if (!hasSupabaseEnv()) {
        setLoadedQuestionId(questionId);
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoadedQuestionId(questionId);
        return;
      }
      const { data } = await supabase
        .from("student_question_notes")
        .select("note_text")
        .eq("user_id", user.id)
        .eq("question_id", questionId)
        .maybeSingle();
      if (!cancelled) {
        setAnswers(
          parseAnswers(typeof data?.note_text === "string" ? data.note_text : ""),
        );
        setLoadedQuestionId(questionId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadedQuestionId, open, questionId]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour-id={tourId}
        className="fixed right-0 top-1/2 z-40 inline-flex h-12 w-10 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-r-0 border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg)] text-[color:var(--foreground)] shadow-lg backdrop-blur-md transition hover:w-12 hover:bg-white/90"
        aria-label="Open notes"
        title="Notes"
      >
        <StickyNote className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close notes"
            onClick={() => setOpen(false)}
          />
          <aside className="relative h-full w-full max-w-md overflow-y-auto border-l border-[color:var(--assignment-glass-border)] bg-[color:var(--background)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--foreground)]">
                  Notes
                </h2>
                <p className="mt-1 text-sm text-[color:var(--foreground)]/60">
                  These notes stay attached to this question.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-[color:var(--foreground)]/50 transition hover:bg-black/5 hover:text-[color:var(--foreground)]"
                aria-label="Close notes"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[color:var(--foreground)]">
                  My notes
                </p>
                <span
                  className={`text-[11px] text-emerald-600 transition-opacity duration-300 ${
                    savedVisible ? "opacity-100" : "opacity-0"
                  }`}
                >
                  Saved
                </span>
              </div>
              <div className="mt-4 space-y-4">
                {NOTE_PROMPTS.map((prompt, index) => (
                  <div key={prompt}>
                    <label
                      htmlFor={`question-note-${index}`}
                      className="text-[13px] font-semibold text-[color:var(--foreground)]"
                    >
                      {prompt}
                    </label>
                    <textarea
                      id={`question-note-${index}`}
                      value={answers[index] ?? ""}
                      onChange={(e) => {
                        const next = [...answers];
                        next[index] = e.target.value;
                        setAnswers(next);
                        scheduleSave(next);
                      }}
                      onBlur={() => void persist(serializeAnswers(answers))}
                      rows={4}
                      placeholder="Write a note..."
                      className="sa-notebook mt-2 w-full resize-none rounded-xl bg-transparent px-3 py-2 text-[14px] leading-[2em] text-[color:var(--foreground)] focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
