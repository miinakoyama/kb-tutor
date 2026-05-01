import { randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Question } from "@/types/question";
import {
  type AssignmentMode,
  type AssignmentSourceType,
  fetchAccessibleQuestionSets,
  getRequester,
  getScopedSchoolIds,
  resolveSnapshotQuestions,
  rollbackAssignment,
  rollbackQuestionSet,
  sanitizeMode,
  sanitizeStringArray,
} from "@/lib/assignments/manage-helpers";

export async function GET(request: NextRequest) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const includeQuestionsForSetId = url.searchParams.get("questionsForSetId");

  const admin = createSupabaseAdminClient();
  const schoolResult = await getScopedSchoolIds(admin, requester);
  if ("error" in schoolResult) {
    return NextResponse.json({ error: schoolResult.error }, { status: 400 });
  }
  const schools = schoolResult.schools;
  const schoolIds = schools.map((item) => item.id);

  if (includeQuestionsForSetId) {
    const setId = includeQuestionsForSetId.trim();
    if (!setId) {
      return NextResponse.json({ error: "Missing set id" }, { status: 400 });
    }
    const accessibleSetsResult = await fetchAccessibleQuestionSets(
      admin,
      requester,
      schoolIds,
    );
    if ("error" in accessibleSetsResult) {
      return NextResponse.json(
        { error: accessibleSetsResult.error },
        { status: 400 },
      );
    }
    if (!accessibleSetsResult.rows.some((row) => row.id === setId)) {
      return NextResponse.json(
        { error: "Question set not found or not accessible." },
        { status: 403 },
      );
    }
    const { data: questionRows, error: questionError } = await admin
      .from("generated_questions")
      .select("id,payload,created_at")
      .eq("set_id", setId)
      .order("created_at", { ascending: true });
    if (questionError) {
      return NextResponse.json({ error: questionError.message }, { status: 400 });
    }
    return NextResponse.json({
      setId,
      questions: (questionRows ?? []).map((row) => ({
        questionId: String(row.id),
        payload: row.payload,
      })),
    });
  }

  if (schoolIds.length === 0) {
    return NextResponse.json({ schools: [], assignments: [], question_sets: [] });
  }

  const [
    { data: assignmentsData, error: assignmentError },
    { data: memberRows, error: memberError },
  ] = await Promise.all([
    admin
      .from("assignments")
      .select(
        "id,title,school_id,due_date,module_ids,topics,target_minutes,created_at,created_by,mode,randomize_order,max_questions,review_topics,review_standards,instructions",
      )
      .in("school_id", schoolIds)
      .order("created_at", { ascending: false }),
    admin
      .from("school_members")
      .select("school_id,student_user_id")
      .in("school_id", schoolIds),
  ]);

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  const assignmentIds = (assignmentsData ?? []).map((a) => a.id);
  const [
    { data: snapshotRows, error: snapshotError },
    { data: attemptRows, error: attemptError },
    { data: targetRows, error: targetError },
  ] = await Promise.all([
    assignmentIds.length > 0
      ? admin
          .from("assignment_question_snapshots")
          .select("assignment_id,source_type")
          .in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [], error: null as null | { message: string } }),
    assignmentIds.length > 0
      ? admin
          .from("attempts")
          .select("assignment_id,user_id")
          .in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [], error: null as null | { message: string } }),
    assignmentIds.length > 0
      ? admin
          .from("assignment_targets")
          .select("assignment_id,student_user_id")
          .in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [], error: null as null | { message: string } }),
  ]);

  if (snapshotError) {
    return NextResponse.json({ error: snapshotError.message }, { status: 400 });
  }
  if (attemptError) {
    return NextResponse.json({ error: attemptError.message }, { status: 400 });
  }
  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 400 });
  }

  const attemptUserIds = Array.from(
    new Set((attemptRows ?? []).map((row) => String(row.user_id))),
  );
  const memberUserIds = Array.from(
    new Set((memberRows ?? []).map((row) => String(row.student_user_id))),
  );
  const targetUserIds = Array.from(
    new Set((targetRows ?? []).map((row) => String(row.student_user_id))),
  );
  const profileIdsForExclusion = Array.from(
    new Set([...attemptUserIds, ...memberUserIds, ...targetUserIds]),
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

  const accessibleSetsResult = await fetchAccessibleQuestionSets(
    admin,
    requester,
    schoolIds,
  );
  if ("error" in accessibleSetsResult) {
    return NextResponse.json(
      { error: accessibleSetsResult.error },
      { status: 400 },
    );
  }
  const setIds = accessibleSetsResult.rows.map((row) => row.id);
  const { data: setQuestionRows, error: setQuestionError } =
    setIds.length > 0
      ? await admin.from("generated_questions").select("set_id").in("set_id", setIds)
      : { data: [], error: null as null | { message: string } };
  if (setQuestionError) {
    return NextResponse.json({ error: setQuestionError.message }, { status: 400 });
  }
  const setQuestionCount = new Map<string, number>();
  for (const row of setQuestionRows ?? []) {
    setQuestionCount.set(
      String(row.set_id),
      (setQuestionCount.get(String(row.set_id)) ?? 0) + 1,
    );
  }

  const schoolMemberCount = new Map<string, number>();
  for (const row of memberRows ?? []) {
    if (excludedUserIds.has(String(row.student_user_id))) continue;
    schoolMemberCount.set(row.school_id, (schoolMemberCount.get(row.school_id) ?? 0) + 1);
  }

  const snapshotCountByAssignment = new Map<string, number>();
  const sourceTypeByAssignment = new Map<string, string>();
  for (const row of snapshotRows ?? []) {
    snapshotCountByAssignment.set(
      row.assignment_id,
      (snapshotCountByAssignment.get(row.assignment_id) ?? 0) + 1,
    );
    if (!sourceTypeByAssignment.has(row.assignment_id)) {
      sourceTypeByAssignment.set(row.assignment_id, row.source_type);
    }
  }

  const attemptCountByAssignment = new Map<string, number>();
  const respondentsByAssignment = new Map<string, Set<string>>();
  for (const row of attemptRows ?? []) {
    const id = row.assignment_id as string | null;
    if (!id) continue;
    if (excludedUserIds.has(String(row.user_id))) continue;
    attemptCountByAssignment.set(id, (attemptCountByAssignment.get(id) ?? 0) + 1);
    if (!respondentsByAssignment.has(id)) {
      respondentsByAssignment.set(id, new Set());
    }
    respondentsByAssignment.get(id)!.add(String(row.user_id));
  }

  return NextResponse.json({
    schools: schools.map((item) => ({
      id: item.id,
      name: item.name,
      teacher_user_id: item.teacher_user_id,
      member_count: schoolMemberCount.get(item.id) ?? 0,
    })),
    assignments: (assignmentsData ?? []).map((assignment) => ({
      ...assignment,
      snapshot_count: snapshotCountByAssignment.get(assignment.id) ?? 0,
      source_type: sourceTypeByAssignment.get(assignment.id) ?? null,
      attempt_count: attemptCountByAssignment.get(assignment.id) ?? 0,
      respondent_count: respondentsByAssignment.get(assignment.id)?.size ?? 0,
    })),
    question_sets: accessibleSetsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      user_id: row.user_id,
      generated_at: row.generated_at,
      school_ids: row.school_ids,
      owned_by_requester: row.owned_by_requester,
      question_count: setQuestionCount.get(row.id) ?? 0,
    })),
  });
}

export async function POST(request: Request) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    schoolId?: string;
    dueDate?: string | null;
    moduleIds?: number[];
    topics?: string[];
    targetMinutes?: number;
    mode?: AssignmentMode;
    randomizeOrder?: boolean;
    instructions?: string | null;
    sourceType?: AssignmentSourceType;
    existingSetId?: string;
    selectedQuestions?: Array<{ setId: string; questionIds: string[] }>;
    generatedQuestions?: unknown[];
    manualQuestions?: unknown[];
    reviewScope?: {
      topics?: string[];
      standards?: string[];
      maxQuestions?: number;
    };
    saveAsNewSet?: boolean;
  };

  const title = body.title?.trim();
  const schoolId = body.schoolId?.trim();
  const targetMinutes =
    typeof body.targetMinutes === "number" && Number.isFinite(body.targetMinutes)
      ? Math.max(1, Math.min(180, Math.round(body.targetMinutes)))
      : 20;
  const mode = sanitizeMode(body.mode);
  const randomizeOrder = body.randomizeOrder !== false;
  // Store trimmed instructions, and null-out when the string is empty so
  // the column stays NULL instead of an empty string (simpler "has
  // instructions?" checks downstream).
  const rawInstructions =
    typeof body.instructions === "string" ? body.instructions.trim() : "";
  const instructions = rawInstructions.length > 0 ? rawInstructions : null;

  if (!title || !schoolId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const schoolResult = await getScopedSchoolIds(admin, requester);
  if ("error" in schoolResult) {
    return NextResponse.json({ error: schoolResult.error }, { status: 400 });
  }
  const targetSchool = schoolResult.schools.find((item) => item.id === schoolId);
  if (!targetSchool) {
    return NextResponse.json(
      { error: "You do not have access to this school." },
      { status: 403 },
    );
  }

  let snapshotQuestions: Question[] = [];
  let resolvedSourceType: AssignmentSourceType | null = null;
  let reviewTopics: string[] = [];
  let reviewStandards: string[] = [];
  let maxQuestions: number | null = null;
  let moduleIds: number[] = [];
  let topics: string[] = [];

  if (mode === "review") {
    reviewTopics = sanitizeStringArray(body.reviewScope?.topics);
    reviewStandards = sanitizeStringArray(body.reviewScope?.standards);
    if (reviewTopics.length === 0 && reviewStandards.length === 0) {
      return NextResponse.json(
        { error: "Review mode requires at least one topic or standard." },
        { status: 400 },
      );
    }
    const rawMax = body.reviewScope?.maxQuestions;
    if (typeof rawMax !== "number" || !Number.isFinite(rawMax) || rawMax < 1) {
      return NextResponse.json(
        { error: "Review mode requires maxQuestions >= 1." },
        { status: 400 },
      );
    }
    maxQuestions = Math.max(1, Math.min(50, Math.round(rawMax)));
    topics =
      Array.isArray(body.topics) && body.topics.length > 0
        ? body.topics.map((item) => item.trim()).filter(Boolean)
        : reviewTopics;
  } else {
    const snapshotResolution = await resolveSnapshotQuestions(
      admin,
      requester,
      schoolResult.schools.map((item) => item.id),
      body,
    );
    if ("error" in snapshotResolution) {
      return NextResponse.json(
        { error: snapshotResolution.error },
        { status: snapshotResolution.status },
      );
    }
    snapshotQuestions = snapshotResolution.questions;
    resolvedSourceType = snapshotResolution.sourceType;
    moduleIds = Array.from(
      new Set(
        snapshotQuestions
          .map((question) => question.module)
          .filter((value) => Number.isFinite(value)),
      ),
    );
    topics =
      Array.isArray(body.topics) && body.topics.length > 0
        ? body.topics.map((item) => item.trim()).filter(Boolean)
        : Array.from(
            new Set(snapshotQuestions.map((question) => question.topic).filter(Boolean)),
          );
  }

  const assignmentId = `as_${randomUUID().slice(0, 8)}`;
  const { error: assignmentError } = await admin.from("assignments").insert({
    id: assignmentId,
    title,
    school_id: schoolId,
    due_date: body.dueDate || null,
    module_ids: moduleIds,
    topics,
    target_minutes: targetMinutes,
    created_by: requester.id,
    mode,
    randomize_order: randomizeOrder,
    max_questions: maxQuestions,
    review_topics: mode === "review" ? reviewTopics : null,
    review_standards: mode === "review" ? reviewStandards : null,
    instructions,
  });
  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }

  // From here on, if any child insert fails we best-effort delete the
  // parent assignment (cascades to targets/snapshots) to avoid leaving a
  // half-created assignment that students would see as broken.
  const { data: schoolMembers, error: schoolMemberError } = await admin
    .from("school_members")
    .select("student_user_id")
    .eq("school_id", schoolId);
  if (schoolMemberError) {
    await rollbackAssignment(admin, assignmentId);
    return NextResponse.json({ error: schoolMemberError.message }, { status: 400 });
  }

  const studentIds = Array.from(
    new Set((schoolMembers ?? []).map((member) => member.student_user_id)),
  );
  if (studentIds.length > 0) {
    const { error: targetInsertError } = await admin.from("assignment_targets").insert(
      studentIds.map((studentId) => ({
        assignment_id: assignmentId,
        student_user_id: studentId,
      })),
    );
    if (targetInsertError) {
      await rollbackAssignment(admin, assignmentId);
      return NextResponse.json({ error: targetInsertError.message }, { status: 400 });
    }
  }

  if (mode !== "review" && resolvedSourceType) {
    const { error: snapshotInsertError } = await admin
      .from("assignment_question_snapshots")
      .insert(
        snapshotQuestions.map((question, index) => ({
          assignment_id: assignmentId,
          order_index: index,
          question_id: question.id,
          source_type: resolvedSourceType,
          payload: question,
        })),
      );
    if (snapshotInsertError) {
      await rollbackAssignment(admin, assignmentId);
      return NextResponse.json({ error: snapshotInsertError.message }, { status: 400 });
    }
  }

  let createdQuestionSetId: string | null = null;
  if (
    mode !== "review" &&
    resolvedSourceType === "manual" &&
    body.saveAsNewSet === true &&
    snapshotQuestions.length > 0
  ) {
    const generatedAt = new Date().toISOString();
    const newSetId = `manual-${assignmentId}-${Date.now().toString(36)}`;
    const { error: setInsertError } = await admin
      .from("generated_question_sets")
      .insert({
        id: newSetId,
        user_id: requester.id,
        name: title,
        generated_at: generatedAt,
        generation_model_id: null,
        generation_model_label: "Manual",
      });
    if (setInsertError) {
      // Keep the assignment (it is valid on its own) but report the set
      // failure clearly. Nothing to roll back yet — the set row never landed.
      return NextResponse.json(
        {
          error: `Assignment created but failed to save question set: ${setInsertError.message}`,
        },
        { status: 400 },
      );
    }
    const { error: setQuestionsInsertError } = await admin
      .from("generated_questions")
      .insert(
        snapshotQuestions.map((question) => ({
          id: question.id,
          set_id: newSetId,
          user_id: requester.id,
          payload: question,
          is_visible: true,
          include_in_self_practice: false,
        })),
      );
    if (setQuestionsInsertError) {
      // The set header landed but its questions did not. Compensating delete
      // so the user doesn't see an empty ghost set in their library.
      await rollbackQuestionSet(admin, newSetId);
      return NextResponse.json(
        {
          error: `Assignment created but failed to save question set rows: ${setQuestionsInsertError.message}`,
        },
        { status: 400 },
      );
    }
    createdQuestionSetId = newSetId;
  }

  return NextResponse.json({
    ok: true,
    assignmentId,
    targetCount: studentIds.length,
    questionCount: snapshotQuestions.length,
    mode,
    questionSetId: createdQuestionSetId,
  });
}

export async function DELETE(request: Request) {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { id?: string };
  const assignmentId = body.id?.trim();
  if (!assignmentId) {
    return NextResponse.json({ error: "Missing assignment id" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: assignment, error: assignmentError } = await admin
    .from("assignments")
    .select("id,school_id,created_by")
    .eq("id", assignmentId)
    .maybeSingle();

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  if (requester.role === "teacher") {
    const schoolResult = await getScopedSchoolIds(admin, requester);
    if ("error" in schoolResult) {
      return NextResponse.json({ error: schoolResult.error }, { status: 400 });
    }
    const canAccessSchool = schoolResult.schools.some(
      (item) => item.id === assignment.school_id,
    );
    if (!canAccessSchool) {
      return NextResponse.json(
        { error: "You do not have access to this assignment." },
        { status: 403 },
      );
    }
  }

  const { error: deleteError } = await admin
    .from("assignments")
    .delete()
    .eq("id", assignmentId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
