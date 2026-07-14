"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyTerm } from "@/types/short-answer";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

interface CompletionSectionProps {
  questionId: string;
  keyTerms: KeyTerm[];
  continueLabel: string;
  onContinue: () => void;
  /** My Notes is hidden in exam mode. */
  showNotes?: boolean;
  initialNote?: string;
  showContinueButton?: boolean;
}

export function CompletionSection({
  questionId,
  keyTerms,
  continueLabel,
  onContinue,
  showNotes = true,
  initialNote = "",
  showContinueButton = true,
}: CompletionSectionProps) {
  const [note, setNote] = useState(initialNote);
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
    (text: string) => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => void persist(text), 400);
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <section className="flex flex-col gap-4">
      <div
        className="rounded-2xl border border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg)] p-5 backdrop-blur-md"
        style={{ boxShadow: "var(--assignment-card-shadow)" }}
      >
        <h3 className="text-sm font-semibold text-[color:var(--foreground)]">Key Terms</h3>
        <p className="text-[11px] text-[color:var(--foreground)]/50">
          Terms that came up in this question
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {keyTerms.map((kt) => (
            <li
              key={kt.term}
              className="flex flex-col gap-0.5 rounded-xl bg-black/[0.03] px-3 py-2 sm:flex-row sm:items-baseline sm:gap-2"
            >
              <span className="text-[13px] font-semibold text-[color:var(--foreground)]">
                {kt.term}
              </span>
              <span className="text-[13px] text-[color:var(--foreground)]/70">
                {kt.definition}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {showNotes && (
        <div
          className="rounded-2xl border border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg)] p-5 backdrop-blur-md"
          style={{ boxShadow: "var(--assignment-card-shadow)" }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--foreground)]">
              My Notes{" "}
              <span className="text-[11px] font-normal text-[color:var(--foreground)]/45">
                (optional)
              </span>
            </h3>
            <span
              className={`text-[11px] text-[var(--mastery-mastered)] transition-opacity duration-300 ${
                savedVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              Saved
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Write anything — or try one of these: &ldquo;The main idea was…&rdquo;,
            &ldquo;I was surprised that…&rdquo;, &ldquo;Next time I&apos;ll remember…&rdquo;
          </p>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              scheduleSave(e.target.value);
            }}
            onBlur={() => void persist(note)}
            rows={5}
            aria-label="My notes"
            placeholder="Your notes (only you can see these)…"
            className="sa-notebook mt-3 w-full resize-none rounded-xl bg-transparent px-3 py-2 text-[14px] leading-[2em] text-[color:var(--foreground)] focus:outline-none"
          />
        </div>
      )}

      {showContinueButton && (
        <button
          type="button"
          onClick={onContinue}
          className="w-full rounded-full bg-[color:var(--assignment-cta-bg-strong)] px-4 py-3 text-sm font-bold text-[color:var(--assignment-cta-text)] transition hover:bg-[color:var(--assignment-cta-bg-hover)]"
        >
          {continueLabel}
        </button>
      )}
    </section>
  );
}
