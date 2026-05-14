import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Question } from "@/types/question";
import {
  type AdminClient,
  type AssignmentMode,
  type AssignmentSourceType,
  type Requester,
  fetchAllSupabaseRows,
  getRequester,
  getScopedSchoolIds,
} from "@/lib/assignments/manage-helpers";

/**
 * Load the assignment row, ensuring the requester has access to its school.
 * Returns the assignment row on success, or an error tuple.
 */
async function loadAssignmentForRequester(
  admin: AdminClient,
  requester: Requester,
  assignmentId: string,
): Promise<
  | {
      assignment: {
        id: string;
        title: string;
        school_id: string;
        due_date: string | null;
        module_ids: number[] | null;
        topics: string[] | null;
        target_minutes: number;
        created_at: string;
        created_by: string;
        mode: AssignmentMode | null;
        randomize_order: boolean | null;
        max_questions: number | null;
        review_topics: string[] | null;
        review_standards: string[] | null;
        instructions: string | null;
      };
    }
  | { error: string; status: number }
> {
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select(
      "id,title,school_id,due_date,module_ids,topics,target_minutes,created_at,created_by,mode,randomize_order,max_questions,review_topics,review_standards,instructions",
    )
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError) {
    return { error: assignmentError.message, status: 400 };
  }
  if (!assignment) {
    return { error: "Assignment not found.", status: 404 };
  }

  if (requester.role === "teacher") {
    const schoolResult = await getScopedSchoolIds(admin, requester);
    if ("error" in schoolResult) {
      return { error: schoolResult.error, status: 400 };
    }
    const canAccess = schoolResult.schools.some(
      (item) => item.id === assignment.school_id,
    );
    if (!canAccess) {
      return { error: "You do not have access to this assignment.", status: 403 };
    }
  }

  return {
    assignment: {
      id: String(assignment.id),
      title: String(assignment.title),
      school_id: String(assignment.school_id),
      due_date: assignment.due_date ? String(assignment.due_date) : null,
      module_ids: (assignment.module_ids as number[] | null) ?? null,
      topics: (assignment.topics as string[] | null) ?? null,
      target_minutes: Number(assignment.target_minutes),
      created_at: String(assignment.created_at),
      created_by: String(assignment.created_by),
      mode: (assignment.mode as AssignmentMode | null) ?? null,
      randomize_order:
        typeof assignment.randomize_order === "boolean"
          ? assignment.randomize_order
          : null,
      max_questions:
        typeof assignment.max_questions === "number" ? assignment.max_questions : null,
      review_topics: (assignment.review_topics as string[] | null) ?? null,
      review_standards: (assignment.review_standards as string[] | null) ?? null,
      instructions:
        typeof assignment.instructions === "string"
          ? assignment.instructions
          : null,
    },
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { assignmentId: rawId } = await params;
  const assignmentId = rawId?.trim();
  if (!assignmentId) {
    return NextResponse.json({ error: "Missing assignment id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const loaded = await loadAssignmentForRequester(admin, requester, assignmentId);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  const assignment = loaded.assignment;

  const [
    { data: snapshotRows, error: snapshotError },
    { data: targetRows, error: targetError },
    { data: attemptRows, error: attemptError },
    { data: schoolRow, error: schoolError },
    { data: memberRows, error: memberError },
  ] = await Promise.all([
    admin
      .from("assignment_question_snapshots")
      .select("order_index,question_id,source_type,payload")
      .eq("assignment_id", assignmentId)
      .order("order_index", { ascending: true }),
    admin
      .from("assignment_targets")
      .select("student_user_id,last_completed_at")
      .eq("assignment_id", assignmentId),
    fetchAllSupabaseRows<{
      id: string;
      user_id: string;
      question_id: string | null;
      is_correct: boolean | null;
      answered_at: string | null;
    }>((from, to) =>
      admin
        .from("attempts")
        .select("id,user_id,question_id,is_correct,answered_at")
        .eq("assignment_id", assignmentId)
        .order("answered_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    admin
      .from("schools")
      .select("id,name")
      .eq("id", assignment.school_id)
      .maybeSingle(),
    admin
      .from("school_members")
      .select("student_user_id")
      .eq("school_id", assignment.school_id),
  ]);

  if (snapshotError) {
    return NextResponse.json({ error: snapshotError.message }, { status: 400 });
  }
  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 400 });
  }
  if (attemptError) {
    return NextResponse.json({ error: attemptError.message }, { status: 400 });
  }
  if (schoolError) {
    return NextResponse.json({ error: schoolError.message }, { status: 400 });
  }
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  const questions = (snapshotRows ?? []).map((row) => ({
    orderIndex: Number(row.order_index),
    questionId: String(row.question_id),
    sourceType: String(row.source_type) as AssignmentSourceType,
    payload: row.payload as Question,
  }));

  const attemptUserIds = Array.from(
    new Set((attemptRows ?? []).map((row) => String(row.user_id))),
  );
  const targetUserIds = Array.from(
    new Set((targetRows ?? []).map((row) => String(row.student_user_id))),
  );
  const memberUserIds = Array.from(
    new Set((memberRows ?? []).map((row) => String(row.student_user_id))),
  );
  const profileIdsForExclusion = Array.from(
    new Set([...attemptUserIds, ...targetUserIds, ...memberUserIds]),
  );
  const excludedUserIds = new Set<string>();
  if (profileIdsForExclusion.length > 0) {
    const { data: excludedRows, error: excludedError } = await admin
      .from("profiles")
      .select("id")
      .in("id", profileIdsForExclusion)
      .eq("excluded_from_analytics", true);
    if (excludedError) {
      return NextResponse.json({ error: excludedError.message }, { status: 400 });
    }
    for (const row of excludedRows ?? []) {
      excludedUserIds.add(String(row.id));
    }
  }

  // The student roster shown in the management view is the union of:
  //   - current school members (source of truth for who currently sees the
  //     assignment — school-membership drives visibility on the student side,
  //     so we want all of them to appear here even if they joined after
  //     creation and have no assignment_targets row yet)
  //   - any user_id that has an assignment_target row (historical targets)
  // The target rows keep former-member history visible while avoiding trust in
  // client-supplied assignment_id values on unrelated attempts.
  const currentMemberIds = new Set(
    (memberRows ?? []).map((row) => String(row.student_user_id)),
  );
  const targetStudentIdSet = new Set(
    (targetRows ?? []).map((row) => String(row.student_user_id)),
  );
  const profileLookupIds = [
    ...new Set([
      ...currentMemberIds,
      ...targetStudentIdSet,
    ]),
  ].filter((id) => !excludedUserIds.has(id));
  const { data: profileRows, error: profileError } =
    profileLookupIds.length > 0
      ? await admin
          .from("profiles")
          .select("id,student_id,display_name")
          .in("id", profileLookupIds)
      : { data: [], error: null };
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  const profileById = new Map<
    string,
    { student_id: string | null; display_name: string | null }
  >(
    (profileRows ?? []).map((profile) => [
      String(profile.id),
      {
        student_id:
          typeof profile.student_id === "string" ? profile.student_id : null,
        display_name:
          typeof profile.display_name === "string" ? profile.display_name : null,
      },
    ]),
  );
  const isKnownStudent = (userId: string) =>
    currentMemberIds.has(userId) || targetStudentIdSet.has(userId);
  const filteredAttemptRows = (attemptRows ?? []).filter((row) => {
    const userId = String(row.user_id);
    return !excludedUserIds.has(userId) && isKnownStudent(userId);
  });
  const allStudentIds = [
    ...new Set([
      ...currentMemberIds,
      ...targetStudentIdSet,
    ]),
  ].filter((id) => !excludedUserIds.has(id));

  const respondents = new Set<string>();
  let correctAttempts = 0;
  for (const row of filteredAttemptRows) {
    respondents.add(String(row.user_id));
    if (row.is_correct) correctAttempts += 1;
  }
  for (const row of targetRows ?? []) {
    const studentUserId = String(row.student_user_id);
    if (excludedUserIds.has(studentUserId) || !isKnownStudent(studentUserId)) {
      continue;
    }
    if (typeof row.last_completed_at === "string") {
      respondents.add(studentUserId);
    }
  }

  const lastCompletedByStudent = new Map<string, string | null>();
  for (const row of targetRows ?? []) {
    const studentUserId = String(row.student_user_id);
    const lastCompletedAt =
      typeof row.last_completed_at === "string" ? row.last_completed_at : null;
    lastCompletedByStudent.set(studentUserId, lastCompletedAt);
  }

  const answeredByStudent = new Map<string, Set<string>>();
  for (const row of filteredAttemptRows) {
    const studentUserId = String(row.user_id);
    const lastCompletedAt = lastCompletedByStudent.get(studentUserId) ?? null;
    if (lastCompletedAt) {
      const answeredAt =
        typeof row.answered_at === "string" ? row.answered_at : null;
      if (!answeredAt) continue;
      if (new Date(answeredAt).getTime() <= new Date(lastCompletedAt).getTime()) {
        continue;
      }
    }
    if (!answeredByStudent.has(studentUserId)) {
      answeredByStudent.set(studentUserId, new Set());
    }
    answeredByStudent.get(studentUserId)?.add(String(row.question_id));
  }

  const totalQuestions =
    assignment.mode === "review"
      ? Math.max(0, assignment.max_questions ?? 0)
      : questions.length;
  const studentProgress = allStudentIds.map((studentUserId) => {
    const profile = profileById.get(studentUserId);
    const answered = answeredByStudent.get(studentUserId)?.size ?? 0;
    const lastCompletedAt = lastCompletedByStudent.get(studentUserId) ?? null;
    const status = lastCompletedAt
      ? "completed"
      : answered > 0
        ? "in_progress"
        : "not_started";
    return {
      student_user_id: studentUserId,
      student_id: profile?.student_id ?? null,
      display_name: profile?.display_name ?? null,
      is_current_member: currentMemberIds.has(studentUserId),
      answered_questions:
        status === "completed"
          ? totalQuestions
          : Math.min(answered, totalQuestions),
      total_questions: totalQuestions,
      completion_rate:
        totalQuestions > 0
          ? Math.round(
              (((status === "completed" ? totalQuestions : answered) /
                totalQuestions) *
                100 +
                Number.EPSILON) *
                10,
            ) / 10
          : 0,
      status,
      last_completed_at: lastCompletedAt,
    };
  });

  const sourceType =
    questions.length > 0 ? questions[0].sourceType : null;

  return NextResponse.json({
    assignment: {
      ...assignment,
      school_name: schoolRow?.name ?? null,
    },
    questions,
    source_type: sourceType,
    targets: {
      // Reflect the current school roster rather than the creation-time
      // snapshot: school membership is what determines who currently sees
      // the assignment on the student side.
      total: [...currentMemberIds].filter((id) => !excludedUserIds.has(id)).length,
      student_ids: [...currentMemberIds].filter((id) => !excludedUserIds.has(id)),
    },
    attempts: {
      total: filteredAttemptRows.length,
      respondents: respondents.size,
      correct: correctAttempts,
    },
    student_progress: studentProgress,
  });
}

/**
 * PATCH only accepts "safe" metadata fields.
 *
 * Once an assignment has been created and distributed to students, there is no
 * way to detect students who are currently mid-way through it (the schema does
 * not track per-student viewed_at / started_at), so we never allow editing the
 * question content, mode, or review scope after creation. Teachers must delete
 * and recreate to change those.
 */
interface PatchBody {
  title?: string;
  dueDate?: string | null;
  targetMinutes?: number;
  randomizeOrder?: boolean;
  instructions?: string | null;
}

const DISALLOWED_CONTENT_KEYS = [
  "mode",
  "sourceType",
  "selectedQuestions",
  "generatedQuestions",
  "manualQuestions",
  "existingSetId",
  "reviewScope",
  "schoolId",
  "topics",
  "moduleIds",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { assignmentId: rawId } = await params;
  const assignmentId = rawId?.trim();
  if (!assignmentId) {
    return NextResponse.json({ error: "Missing assignment id" }, { status: 400 });
  }

  const rawBody = (await request.json()) as Record<string, unknown>;
  const rejected = DISALLOWED_CONTENT_KEYS.filter((key) => key in rawBody);
  if (rejected.length > 0) {
    return NextResponse.json(
      {
        error:
          "Questions, mode, review scope, and school cannot be edited after creation. Delete and recreate the assignment to change these.",
        rejected_fields: rejected,
      },
      { status: 409 },
    );
  }

  const body = rawBody as PatchBody;
  const admin = createSupabaseAdminClient();

  const loaded = await loadAssignmentForRequester(admin, requester, assignmentId);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    }
    updates.title = title;
  }

  if ("dueDate" in body) {
    updates.due_date =
      typeof body.dueDate === "string" && body.dueDate.length > 0
        ? body.dueDate
        : null;
  }

  if (typeof body.targetMinutes === "number" && Number.isFinite(body.targetMinutes)) {
    updates.target_minutes = Math.max(1, Math.min(180, Math.round(body.targetMinutes)));
  }

  if (typeof body.randomizeOrder === "boolean") {
    updates.randomize_order = body.randomizeOrder;
  }

  if ("instructions" in body) {
    if (body.instructions === null || body.instructions === undefined) {
      updates.instructions = null;
    } else if (typeof body.instructions === "string") {
      const trimmed = body.instructions.trim();
      updates.instructions = trimmed.length > 0 ? trimmed : null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, assignment_id: assignmentId });
  }

  const { error: updateError } = await admin
    .from("assignments")
    .update(updates)
    .eq("id", assignmentId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, assignment_id: assignmentId });
}
