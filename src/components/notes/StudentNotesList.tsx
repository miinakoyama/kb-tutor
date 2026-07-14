"use client";

import { useEffect, useMemo, useState } from "react";
import { StickyNote } from "lucide-react";
import type { Question } from "@/types/question";
import { QuestionDisplay } from "@/components/shared/QuestionDisplay";
import { StimulusPanel } from "@/components/short-answer/StimulusPanel";

export interface StudentNoteEntry {
  questionId: string;
  noteText: string;
  updatedAt: string;
  question: {
    topic: string | null;
    module: number | null;
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

const NOTE_PROMPTS = [
  "What do I want to remember or come back to?",
  "How does this connect or conflict with something I already know?",
  "What's confusing me here?",
];

interface NoteSection {
  label: string;
  answer: string;
}

/** Splits stored note text back into its prompt/answer pairs; falls back to a single unlabeled section for free-form text. */
function parseNoteSections(text: string): NoteSection[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sections: NoteSection[] = [];
  let matchedAny = false;

  NOTE_PROMPTS.forEach((prompt, index) => {
    const start = trimmed.indexOf(prompt);
    if (start === -1) return;
    matchedAny = true;
    const contentStart = start + prompt.length;
    const nextStarts = NOTE_PROMPTS.map((otherPrompt) =>
      trimmed.indexOf(otherPrompt, contentStart),
    ).filter((pos) => pos !== -1 && pos !== index);
    const end = nextStarts.length > 0 ? Math.min(...nextStarts) : trimmed.length;
    const answer = trimmed.slice(contentStart, end).trim();
    if (answer) sections.push({ label: prompt, answer });
  });

  if (!matchedAny) {
    sections.push({ label: "Note", answer: trimmed });
  }

  return sections;
}

function moduleLabel(module: number | null): string | null {
  if (module === 1) return "A";
  if (module === 2) return "B";
  return null;
}

function firstWordsOfStem(preview: string | null, wordCount = 10): string {
  if (!preview) return "No question preview available.";
  const words = preview.trim().split(/\s+/);
  if (words.length <= wordCount) return preview.trim();
  return `${words.slice(0, wordCount).join(" ")}…`;
}

/** Deterministic given `iso` alone — safe to use on both the server render and the initial client render. */
function formatAbsoluteDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Depends on the current time, so it must never be used for the first render — see useRelativeTimeLabel. */
function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);

  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;

  return formatAbsoluteDate(iso);
}

/**
 * Renders an absolute date on first paint (matches server output) and swaps to a
 * relative label after mount, avoiding a hydration mismatch from Date.now() drift
 * between server render time and client hydration time.
 */
function useRelativeTimeLabel(iso: string): string {
  const [label, setLabel] = useState(() => formatAbsoluteDate(iso));

  useEffect(() => {
    setLabel(formatRelativeTime(iso));
    const id = window.setInterval(() => setLabel(formatRelativeTime(iso)), 60_000);
    return () => window.clearInterval(id);
  }, [iso]);

  return label;
}

function NoteRow({
  note,
  isSelected,
  onSelect,
}: {
  note: StudentNoteEntry;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const stemExcerpt = useMemo(
    () => firstWordsOfStem(note.question.preview),
    [note.question.preview],
  );
  const relativeLabel = useRelativeTimeLabel(note.updatedAt);
  const moduleCode = moduleLabel(note.question.module);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected}
      className={`block w-full border-l-[3px] px-4 py-3 text-left transition-colors ${
        isSelected
          ? "border-[var(--assignment-completed)] bg-[var(--mastery-mastered-bg)]"
          : "border-transparent hover:bg-foreground/5"
      }`}
    >
      <span className="min-w-0">
        {moduleCode && (
          <span className="mb-0.5 block text-xs text-muted-foreground">Module {moduleCode}</span>
        )}
        {note.question.topic ? (
          <span className="block text-sm font-medium text-heading">{note.question.topic}</span>
        ) : (
          <span className="block text-sm font-medium text-muted-foreground">No topic</span>
        )}
      </span>
      <p className="mt-1.5 line-clamp-2 text-sm text-slate-gray">{stemExcerpt}</p>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{relativeLabel}</p>
    </button>
  );
}

function SelectedNoteDetail({
  note,
  question,
}: {
  note: StudentNoteEntry;
  question: Question | undefined;
}) {
  const sections = useMemo(() => parseNoteSections(note.noteText), [note.noteText]);

  const shortAnswer =
    question?.questionType === "open-ended" ? question.shortAnswer : undefined;

  return (
    <div className="flex flex-col gap-4">
      {shortAnswer ? (
        <>
          <StimulusPanel
            stem={shortAnswer.stem}
            stimulus={shortAnswer.stimulus}
          />
          <div className="space-y-2">
            {shortAnswer.parts.map((part) => (
              <div
                key={part.label}
                className="rounded-2xl border border-border-subtle bg-slate-gray/5 px-3 py-2"
              >
                <div className="flex items-start gap-2.5">
                  <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-gray/20 text-[11px] font-semibold text-muted-foreground">
                    {part.label}
                  </span>
                  <p className="flex-1 text-sm text-slate-gray/90">{part.prompt}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : question ? (
        <QuestionDisplay
          question={question}
          questionNumber={1}
          showHeader={false}
          currentAnswer={{ selectedOptionId: question.correctOptionId, isCorrect: true }}
          revealCorrectAnswer
          showOptionFeedbackIcons
          compactLayout
          onOptionClick={() => {}}
        />
      ) : (
        <div className="rounded-2xl border border-border-subtle bg-surface p-4 text-sm text-muted-foreground">
          {note.question.available
            ? "This question can't be previewed right now."
            : "Question no longer available."}
        </div>
      )}

      <div className="rounded-2xl border border-border-subtle bg-surface-muted p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          My note
        </p>
        {sections.length > 0 ? (
          <div className="space-y-3">
            {sections.map((section) => (
              <div key={section.label}>
                {section.label !== "Note" && (
                  <p className="text-[15px] font-medium text-heading">{section.label}</p>
                )}
                <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-gray">
                  {section.answer}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No note text.</p>
        )}
      </div>
    </div>
  );
}

export function StudentNotesList({
  notes,
  isLoaded,
  error,
  questionById,
}: {
  notes: StudentNoteEntry[];
  isLoaded: boolean;
  error: string | null;
  questionById: Map<string, Question>;
}) {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");

  const moduleOptions = useMemo(() => {
    const found = new Set<number>();
    for (const note of notes) {
      if (typeof note.question.module === "number") found.add(note.question.module);
    }
    return Array.from(found)
      .sort((a, b) => a - b)
      .map((module) => ({ value: String(module), label: `Module ${moduleLabel(module)}` }));
  }, [notes]);

  const topicOptions = useMemo(() => {
    const found = new Set<string>();
    for (const note of notes) {
      if (moduleFilter !== "all" && String(note.question.module) !== moduleFilter) continue;
      if (note.question.topic) found.add(note.question.topic);
    }
    return Array.from(found).sort((a, b) => a.localeCompare(b));
  }, [notes, moduleFilter]);

  useEffect(() => {
    if (topicFilter !== "all" && !topicOptions.includes(topicFilter)) {
      setTopicFilter("all");
    }
  }, [topicOptions, topicFilter]);

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      if (moduleFilter !== "all" && String(note.question.module) !== moduleFilter) return false;
      if (topicFilter !== "all" && note.question.topic !== topicFilter) return false;
      return true;
    });
  }, [notes, moduleFilter, topicFilter]);

  useEffect(() => {
    if (filteredNotes.length === 0) {
      setSelectedQuestionId(null);
      return;
    }
    setSelectedQuestionId((prev) =>
      prev && filteredNotes.some((note) => note.questionId === prev)
        ? prev
        : filteredNotes[0].questionId,
    );
  }, [filteredNotes]);

  if (!isLoaded) {
    return <div className="py-16 text-center text-slate-gray">Loading...</div>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[color:var(--error-border)] bg-[color:var(--error-light)] px-4 py-3 text-sm text-[color:var(--error-color)]">
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
          Use the Notes tab while practicing to capture questions, connections,
          and ideas to revisit.
        </p>
      </div>
    );
  }

  const selectedNote =
    filteredNotes.find((note) => note.questionId === selectedQuestionId) ?? filteredNotes[0];
  const selectedQuestion = selectedNote ? questionById.get(selectedNote.questionId) : undefined;
  const selectClassName =
    "w-full rounded-2xl border border-border-default bg-surface px-2 py-1.5 text-xs text-slate-gray focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="flex h-[600px] max-h-[70vh] overflow-hidden rounded-2xl border border-border-subtle">
      <div className="flex w-[380px] flex-shrink-0 flex-col border-r border-border-subtle bg-surface">
        <div className="flex-shrink-0 border-b border-border-subtle px-4 py-3">
          <div className="flex gap-2">
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className={selectClassName}
              aria-label="Filter by module"
            >
              <option value="all">All modules</option>
              {moduleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              className={selectClassName}
              aria-label="Filter by topic"
            >
              <option value="all">All topics</option>
              {topicOptions.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredNotes.map((note) => (
            <NoteRow
              key={note.questionId}
              note={note}
              isSelected={note.questionId === selectedNote?.questionId}
              onSelect={() => setSelectedQuestionId(note.questionId)}
            />
          ))}
          {filteredNotes.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No notes match these filters.
            </p>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {selectedNote ? (
          <SelectedNoteDetail note={selectedNote} question={selectedQuestion} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a note to preview it here.
          </div>
        )}
      </div>
    </div>
  );
}
