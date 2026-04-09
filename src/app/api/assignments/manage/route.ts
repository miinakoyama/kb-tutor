import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRole } from "@/lib/auth/role";
import type { AppRole } from "@/lib/auth/types";
import type { Question } from "@/types/question";

type AssignmentSourceType = "existing_set" | "generated_now" | "manual";

interface Requester {
  id: string;
  role: AppRole;
}

async function getRequester(): Promise<Requester | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  
  if (userError) {
    console.error("[getRequester] Auth error:", userError.message);
    return null;
  }
  if (!user) {
    console.error("[getRequester] No user in session");
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("[getRequester] Profile query warning:", profileError.message);
  }

  let role = resolveRole(profile?.role, user);
  if (!role) {
    const admin = createSupabaseAdminClient();
    const { data: adminProfile, error: adminProfileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (adminProfileError) {
      console.warn("[getRequester] Admin profile query warning:", adminProfileError.message);
    }
    role = resolveRole(adminProfile?.role, user);
  }

  if (!role) {
    console.warn("[getRequester] Could not resolve role for user:", user.id);
  }

  return { id: user.id, role };
}

async function getScopedClassIds(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  requester: Requester,
) {
  let query = admin.from("classes").select("id,name,teacher_user_id").order("name", { ascending: true });
  if (requester.role === "teacher") {
    query = query.eq("teacher_user_id", requester.id);
  }
  const { data, error } = await query;
  if (error) return { error: error.message, classes: [] as Array<{ id: string; name: string; teacher_user_id: string }> };
  return { classes: data ?? [] };
}

function normalizeQuestionPayload(
  raw: unknown,
  index: number,
  sourceType: AssignmentSourceType,
): Question | null {
  if (!raw || typeof raw !== "object") return null;
  const question = raw as Record<string, unknown>;
  const text =
    typeof question.text === "string" ? question.text.trim() : "";
  if (!text) return null;

  const topic =
    typeof question.topic === "string" && question.topic.trim()
      ? question.topic.trim()
      : "Assignment";
  const moduleNumber =
    typeof question.module === "number" && Number.isFinite(question.module)
      ? Math.max(1, Math.round(question.module))
      : 1;

  const optionsRaw = Array.isArray(question.options) ? question.options : [];
  const options = optionsRaw
    .filter((item) => item && typeof item === "object")
    .map((item, optionIndex) => {
      const value = item as Record<string, unknown>;
      const textValue = typeof value.text === "string" ? value.text : "";
      return {
        id:
          typeof value.id === "string" && value.id.trim()
            ? value.id
            : `opt_${optionIndex + 1}`,
        text: textValue,
      };
    })
    .filter((item) => item.text.trim().length > 0);

  if (options.length < 2) return null;

  const correctOptionId =
    typeof question.correctOptionId === "string" &&
    options.some((option) => option.id === question.correctOptionId)
      ? question.correctOptionId
      : options[0].id;

  return {
    id:
      typeof question.id === "string" && question.id.trim()
        ? question.id
        : `assignment-${sourceType}-${Date.now()}-${index + 1}`,
    module: moduleNumber,
    topic,
    standardId:
      typeof question.standardId === "string" ? question.standardId : undefined,
    standardLabel:
      typeof question.standardLabel === "string"
        ? question.standardLabel
        : undefined,
    text,
    imageUrl: null,
    options,
    correctOptionId,
    explanation:
      typeof question.explanation === "string" ? question.explanation : undefined,
    source: "generated",
    isVisible: true,
    generatedAt: new Date().toISOString(),
  };
}

async function resolveSnapshotQuestions(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  requester: Requester,
  body: {
    sourceType?: AssignmentSourceType;
    existingSetId?: string;
    generatedQuestions?: unknown[];
    manualQuestions?: unknown[];
  },
): Promise<{ questions: Question[]; sourceType: AssignmentSourceType } | { error: string; status: number }> {
  const sourceType = body.sourceType ?? "existing_set";

  if (sourceType === "existing_set") {
    const setId = body.existingSetId?.trim();
    if (!setId) {
      return { error: "Missing question set id.", status: 400 };
    }
    let setQuery = admin
      .from("generated_question_sets")
      .select("id,user_id")
      .eq("id", setId);
    if (requester.role === "teacher") {
      setQuery = setQuery.eq("user_id", requester.id);
    }
    const { data: setRow, error: setError } = await setQuery.maybeSingle();
    if (setError) {
      return { error: setError.message, status: 400 };
    }
    if (!setRow) {
      return { error: "Question set not found or not accessible.", status: 403 };
    }

    const { data: questionRows, error: questionError } = await admin
      .from("generated_questions")
      .select("payload,created_at")
      .eq("set_id", setId)
      .order("created_at", { ascending: true });
    if (questionError) {
      return { error: questionError.message, status: 400 };
    }

    const questions = (questionRows ?? [])
      .map((row, index) => normalizeQuestionPayload(row.payload, index, "existing_set"))
      .filter((row): row is Question => row !== null);
    if (questions.length === 0) {
      return { error: "Selected question set has no usable questions.", status: 400 };
    }
    return { questions, sourceType: "existing_set" };
  }

  if (sourceType === "generated_now") {
    const questions = (body.generatedQuestions ?? [])
      .map((row, index) => normalizeQuestionPayload(row, index, "generated_now"))
      .filter((row): row is Question => row !== null);
    if (questions.length === 0) {
      return { error: "Generated questions are missing or invalid.", status: 400 };
    }
    return { questions, sourceType: "generated_now" };
  }

  if (sourceType === "manual") {
    const questions = (body.manualQuestions ?? [])
      .map((row, index) => normalizeQuestionPayload(row, index, "manual"))
      .filter((row): row is Question => row !== null);
    if (questions.length === 0) {
      return { error: "Manual questions are missing or invalid.", status: 400 };
    }
    return { questions, sourceType: "manual" };
  }

  return { error: "Invalid source type.", status: 400 };
}

export async function GET() {
  const requester = await getRequester();
  if (!requester) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!requester.role || !["teacher", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const classResult = await getScopedClassIds(admin, requester);
  if ("error" in classResult) {
    return NextResponse.json({ error: classResult.error }, { status: 400 });
  }
  const classes = classResult.classes;
  const classIds = classes.map((item) => item.id);

  if (classIds.length === 0) {
    return NextResponse.json({ classes: [], assignments: [] });
  }

  const [{ data: assignmentsData, error: assignmentError }, { data: memberRows, error: memberError }] =
    await Promise.all([
      admin
        .from("assignments")
        .select("id,title,class_id,due_date,module_ids,topics,target_minutes,created_at,created_by")
        .in("class_id", classIds)
        .order("created_at", { ascending: false }),
      admin.from("class_members").select("class_id,student_user_id").in("class_id", classIds),
    ]);

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }
  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 400 });
  }

  const assignmentIds = (assignmentsData ?? []).map((a) => a.id);
  const { data: targetRows, error: targetError } =
    assignmentIds.length > 0
      ? await admin
          .from("assignment_targets")
          .select("assignment_id,student_user_id")
          .in("assignment_id", assignmentIds)
      : { data: [], error: null as null | { message: string } };

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 400 });
  }

  const { data: snapshotRows, error: snapshotError } =
    assignmentIds.length > 0
      ? await admin
          .from("assignment_question_snapshots")
          .select("assignment_id,source_type")
          .in("assignment_id", assignmentIds)
      : { data: [], error: null as null | { message: string } };
  if (snapshotError) {
    return NextResponse.json({ error: snapshotError.message }, { status: 400 });
  }

  let setQuery = admin
    .from("generated_question_sets")
    .select("id,name,user_id,generated_at")
    .order("generated_at", { ascending: false });
  if (requester.role === "teacher") {
    setQuery = setQuery.eq("user_id", requester.id);
  }
  const { data: questionSetsData, error: questionSetsError } = await setQuery;
  if (questionSetsError) {
    return NextResponse.json({ error: questionSetsError.message }, { status: 400 });
  }
  const setIds = (questionSetsData ?? []).map((row) => String(row.id));
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

  const classMemberCount = new Map<string, number>();
  for (const row of memberRows ?? []) {
    classMemberCount.set(row.class_id, (classMemberCount.get(row.class_id) ?? 0) + 1);
  }

  const targetCountByAssignment = new Map<string, number>();
  for (const row of targetRows ?? []) {
    targetCountByAssignment.set(
      row.assignment_id,
      (targetCountByAssignment.get(row.assignment_id) ?? 0) + 1,
    );
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

  return NextResponse.json({
    classes: classes.map((item) => ({
      id: item.id,
      name: item.name,
      teacher_user_id: item.teacher_user_id,
      member_count: classMemberCount.get(item.id) ?? 0,
    })),
    assignments: (assignmentsData ?? []).map((assignment) => ({
      ...assignment,
      target_count: targetCountByAssignment.get(assignment.id) ?? 0,
      snapshot_count: snapshotCountByAssignment.get(assignment.id) ?? 0,
      source_type: sourceTypeByAssignment.get(assignment.id) ?? null,
    })),
    question_sets: (questionSetsData ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      user_id: String(row.user_id),
      generated_at: String(row.generated_at),
      question_count: setQuestionCount.get(String(row.id)) ?? 0,
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
    classId?: string;
    dueDate?: string | null;
    moduleIds?: number[];
    topics?: string[];
    targetMinutes?: number;
    sourceType?: AssignmentSourceType;
    existingSetId?: string;
    generatedQuestions?: unknown[];
    manualQuestions?: unknown[];
  };

  const title = body.title?.trim();
  const classId = body.classId?.trim();
  const targetMinutes =
    typeof body.targetMinutes === "number" && Number.isFinite(body.targetMinutes)
      ? Math.max(1, Math.min(180, Math.round(body.targetMinutes)))
      : 20;

  if (!title || !classId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const classResult = await getScopedClassIds(admin, requester);
  if ("error" in classResult) {
    return NextResponse.json({ error: classResult.error }, { status: 400 });
  }
  const targetClass = classResult.classes.find((item) => item.id === classId);
  if (!targetClass) {
    return NextResponse.json({ error: "You do not have access to this class." }, { status: 403 });
  }

  const snapshotResolution = await resolveSnapshotQuestions(admin, requester, body);
  if ("error" in snapshotResolution) {
    return NextResponse.json({ error: snapshotResolution.error }, { status: snapshotResolution.status });
  }
  const snapshotQuestions = snapshotResolution.questions;
  const sourceType = snapshotResolution.sourceType;
  const moduleIds = Array.from(
    new Set(
      snapshotQuestions
        .map((question) => question.module)
        .filter((value) => Number.isFinite(value)),
    ),
  );
  const topics =
    Array.isArray(body.topics) && body.topics.length > 0
      ? body.topics.map((item) => item.trim()).filter(Boolean)
      : Array.from(new Set(snapshotQuestions.map((question) => question.topic).filter(Boolean)));

  const assignmentId = `as_${randomUUID().slice(0, 8)}`;
  const { error: assignmentError } = await admin.from("assignments").insert({
    id: assignmentId,
    title,
    class_id: classId,
    due_date: body.dueDate || null,
    module_ids: moduleIds,
    topics,
    target_minutes: targetMinutes,
    created_by: requester.id,
  });
  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }

  const { data: classMembers, error: classMemberError } = await admin
    .from("class_members")
    .select("student_user_id")
    .eq("class_id", classId);
  if (classMemberError) {
    return NextResponse.json({ error: classMemberError.message }, { status: 400 });
  }

  const studentIds = Array.from(
    new Set((classMembers ?? []).map((member) => member.student_user_id)),
  );
  if (studentIds.length > 0) {
    const { error: targetInsertError } = await admin.from("assignment_targets").insert(
      studentIds.map((studentId) => ({
        assignment_id: assignmentId,
        student_user_id: studentId,
      })),
    );
    if (targetInsertError) {
      return NextResponse.json({ error: targetInsertError.message }, { status: 400 });
    }
  }

  const { error: snapshotInsertError } = await admin
    .from("assignment_question_snapshots")
    .insert(
      snapshotQuestions.map((question, index) => ({
        assignment_id: assignmentId,
        order_index: index,
        question_id: question.id,
        source_type: sourceType,
        payload: question,
      })),
    );
  if (snapshotInsertError) {
    return NextResponse.json({ error: snapshotInsertError.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    assignmentId,
    targetCount: studentIds.length,
    questionCount: snapshotQuestions.length,
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
    .select("id,class_id,created_by")
    .eq("id", assignmentId)
    .maybeSingle();

  if (assignmentError) {
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  if (requester.role === "teacher") {
    const classResult = await getScopedClassIds(admin, requester);
    if ("error" in classResult) {
      return NextResponse.json({ error: classResult.error }, { status: 400 });
    }
    const canAccessClass = classResult.classes.some((item) => item.id === assignment.class_id);
    if (!canAccessClass) {
      return NextResponse.json({ error: "You do not have access to this assignment." }, { status: 403 });
    }
  }

  const { error: deleteError } = await admin.from("assignments").delete().eq("id", assignmentId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

