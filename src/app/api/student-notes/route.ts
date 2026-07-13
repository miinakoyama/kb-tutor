import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_LIMIT = 100;
const PREVIEW_LENGTH = 140;

interface NotePayload {
  topic?: unknown;
  module?: unknown;
  text?: unknown;
  shortAnswer?: { stem?: unknown };
}

function buildPreview(payload: NotePayload | null): {
  topic: string | null;
  module: number | null;
  preview: string | null;
} {
  if (!payload) return { topic: null, module: null, preview: null };
  const topic = typeof payload.topic === "string" ? payload.topic : null;
  const questionModule = typeof payload.module === "number" ? payload.module : null;
  const stem =
    payload.shortAnswer && typeof payload.shortAnswer.stem === "string"
      ? payload.shortAnswer.stem
      : null;
  const text = typeof payload.text === "string" ? payload.text : null;
  const source = stem ?? text;
  const preview =
    source && source.length > PREVIEW_LENGTH
      ? `${source.slice(0, PREVIEW_LENGTH).trimEnd()}…`
      : source;
  return { topic, module: questionModule, preview };
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || 50),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const {
    data: noteRows,
    count,
    error,
  } = await supabase
    .from("student_question_notes")
    .select("question_id, note_text, updated_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[student-notes] fetch failed", error);
    return NextResponse.json(
      { error: "Failed to load notes" },
      { status: 500 },
    );
  }

  const notes = noteRows ?? [];
  const questionIds = notes.map((n) => String(n.question_id));
  const authorizedQuestionIds = new Set<string>();

  if (questionIds.length > 0) {
    const [{ data: mcqAttempts }, { data: saqAttempts }] = await Promise.all([
      supabase
        .from("attempts")
        .select("question_id")
        .eq("user_id", user.id)
        .in("question_id", questionIds),
      supabase
        .from("short_answer_attempts")
        .select("question_id")
        .eq("user_id", user.id)
        .in("question_id", questionIds),
    ]);

    for (const row of mcqAttempts ?? []) {
      if (typeof row.question_id === "string") {
        authorizedQuestionIds.add(row.question_id);
      }
    }
    for (const row of saqAttempts ?? []) {
      if (typeof row.question_id === "string") {
        authorizedQuestionIds.add(row.question_id);
      }
    }
  }

  // Question payloads are joined with the admin client only after proving the
  // current user has answered the question. Otherwise a forged self-scoped note
  // could leak previews of generated questions outside the student's access.
  const payloadById = new Map<string, NotePayload>();
  const previewQuestionIds = questionIds.filter((id) =>
    authorizedQuestionIds.has(id),
  );
  if (previewQuestionIds.length > 0) {
    const admin = createSupabaseAdminClient();
    const { data: questionRows } = await admin
      .from("generated_questions")
      .select("id, payload")
      .in("id", previewQuestionIds);
    for (const row of questionRows ?? []) {
      payloadById.set(String(row.id), row.payload as NotePayload);
    }
  }

  return NextResponse.json({
    notes: notes.map((note) => {
      const payload = payloadById.get(String(note.question_id)) ?? null;
      const { topic, module, preview } = buildPreview(payload);
      return {
        questionId: String(note.question_id),
        noteText: String(note.note_text),
        updatedAt: String(note.updated_at),
        question: {
          topic,
          module,
          preview,
          available: payload !== null,
        },
      };
    }),
    total: count ?? notes.length,
  });
}
