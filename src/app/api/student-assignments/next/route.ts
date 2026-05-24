import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getStudentAssignmentList,
  pickNextStudentAction,
} from "@/lib/student-assignments";

/**
 * GET /api/student-assignments/next
 *
 * Powers the "Next" CTA shown on the practice / exam / review summary
 * screens. Returns a small payload describing where the student should go
 * after finishing the current session.
 *
 * Response shape:
 *   - { type: "assignment", assignment: { id, title, mode, due_date, target_minutes, max_questions, topics } }
 *   - { type: "self_practice" }
 *
 * Query params:
 *   - excludeAssignmentId — optional. The id of the assignment the student
 *     just completed. Excluded so the CTA never says "next: the assignment
 *     you just finished" immediately after its completion screen.
 *
 * Access: only students get a useful answer. Teachers/admins receive
 * `{ type: "self_practice" }` so the CTA degrades gracefully if it ever
 * renders for a non-student context.
 */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const excludeAssignmentId =
    request.nextUrl.searchParams.get("excludeAssignmentId")?.trim() || null;

  const { assignments, error } = await getStudentAssignmentList(
    supabase,
    user.id,
  );
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const action = pickNextStudentAction(assignments, {
    excludeAssignmentId,
  });

  if (action.type === "self_practice") {
    return NextResponse.json({ type: "self_practice" });
  }

  const a = action.assignment;
  return NextResponse.json({
    type: "assignment",
    assignment: {
      id: a.id,
      title: a.title,
      mode: a.mode,
      due_date: a.due_date ?? null,
      target_minutes: a.target_minutes,
      max_questions: a.max_questions,
      topics: a.topics,
      status: a.status,
    },
  });
}
