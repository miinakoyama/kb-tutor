"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, StickyNote } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export interface StudentNoteEntry {
  questionId: string;
  noteText: string;
  updatedAt: string;
  question: {
    topic: string | null;
    preview: string | null;
    available: boolean;
  };
}

export function useStudentNotes() {
  const [notes, setNotes] = useState<StudentNoteEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/student-notes");
        if (!res.ok) throw new Error("failed");
        const data = (await res.json()) as { notes: StudentNoteEntry[] };
        if (!cancelled) setNotes(data.notes);
      } catch {
        if (!cancelled) setError("Could not load your notes. Please try again.");
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { notes, isLoaded, error };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function StudentNoteCard({ note }: { note: StudentNoteEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState(note.noteText);
  const [savedVisible, setSavedVisible] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const persist = useCallback(
    async (value: string) => {
      if (!hasSupabaseEnv()) return;
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      if (value.trim().length === 0) {
        await supabase
          .from("student_question_notes")
          .delete()
          .eq("user_id", user.id)
          .eq("question_id", note.questionId);
        return;
      }
      const { error } = await supabase.from("student_question_notes").upsert(
        {
          user_id: user.id,
          question_id: note.questionId,
          note_text: value,
        },
        { onConflict: "user_id,question_id" },
      );
      if (!error) {
        setSavedVisible(true);
        window.setTimeout(() => setSavedVisible(false), 1500);
      }
    },
    [note.questionId],
  );

  const scheduleSave = useCallback(
    (value: string) => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => void persist(value), 400);
    },
    [persist],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <article
      className="rounded-2xl border border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg)] backdrop-blur-md"
      style={{ boxShadow: "var(--assignment-card-shadow)" }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-5 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {note.question.topic && (
              <span className="rounded-full bg-[color:var(--assignment-mode-practice-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--assignment-mode-practice)]">
                {note.question.topic}
              </span>
            )}
            <span className="text-[11px] text-[color:var(--foreground)]/45">
              {formatDate(note.updatedAt)}
            </span>
          </div>
          {note.question.available ? (
            note.question.preview && (
              <p className="mt-2 line-clamp-2 text-[13px] text-[color:var(--foreground)]/60">
                {note.question.preview}
              </p>
            )
          ) : (
            <p className="mt-2 text-[13px] italic text-[color:var(--foreground)]/45">
              Question no longer available
            </p>
          )}
          <p className="mt-2 line-clamp-2 text-[14px] text-[color:var(--foreground)]">
            {text}
          </p>
        </div>
        <ChevronDown
          className={`mt-1 h-4 w-4 flex-shrink-0 text-[color:var(--foreground)]/40 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-[color:var(--assignment-panel-border)] px-5 pb-5 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--foreground)]/45">
              Your note
            </span>
            <span
              className={`text-[11px] text-emerald-600 transition-opacity duration-300 ${
                savedVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              Saved
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              scheduleSave(e.target.value);
            }}
            onBlur={() => void persist(text)}
            rows={6}
            aria-label="Edit note"
            className="sa-notebook mt-2 w-full resize-none rounded-xl bg-transparent px-3 py-2 text-[14px] leading-[2em] text-[color:var(--foreground)] focus:outline-none"
          />
        </div>
      )}
    </article>
  );
}

export function StudentNotesList({
  notes,
  isLoaded,
  error,
}: {
  notes: StudentNoteEntry[];
  isLoaded: boolean;
  error: string | null;
}) {
  if (!isLoaded) {
    return <div className="py-16 text-center text-slate-gray">Loading...</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[color:var(--error-border)] bg-[color:var(--error-light)] px-4 py-3 text-sm text-[color:var(--error-color)]">
        {error}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div
        className="rounded-2xl border border-[color:var(--assignment-glass-border)] bg-[color:var(--assignment-glass-bg)] p-10 text-center backdrop-blur-md"
        style={{ boxShadow: "var(--assignment-card-shadow)" }}
      >
        <StickyNote className="mx-auto h-8 w-8 text-[color:var(--foreground)]/30" />
        <p className="mt-3 text-sm font-semibold text-[color:var(--foreground)]">
          No notes yet
        </p>
        <p className="mt-1 text-[13px] text-[color:var(--foreground)]/55">
          After you finish a written-answer question, you can jot down what you
          learned. Your notes will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((note) => (
        <StudentNoteCard key={note.questionId} note={note} />
      ))}
    </div>
  );
}
