import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface AttemptRow {
  user_id: string;
  standard_id: string | null;
  standard_label: string | null;
  is_correct: boolean;
  time_spent_sec: number | null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const classId = url.searchParams.get("classId") || undefined;
  const studentId = url.searchParams.get("studentId") || undefined;
  const range = (url.searchParams.get("range") as "7d" | "30d" | "all" | null) ?? "30d";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .maybeSingle();
  if (!currentProfile || !["teacher", "admin"].includes(String(currentProfile.role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let classesQuery = supabase.from("classes").select("id,name,teacher_user_id");
  if (currentProfile.role === "teacher") {
    classesQuery = classesQuery.eq("teacher_user_id", user.id);
  }
  const { data: classesData } = await classesQuery.order("name", { ascending: true });
  const classIds = (classesData ?? []).map((item) => String(item.id));
  if (classIds.length === 0) {
    return NextResponse.json({
      classes: [],
      students: [],
      summary: { totalAnswered: 0, totalCorrect: 0, overallAccuracy: 0 },
      byStandard: [],
      byStudent: [],
    });
  }

  const effectiveClassIds = classId && classIds.includes(classId) ? [classId] : classIds;

  const { data: memberRows } = await supabase
    .from("class_members")
    .select("class_id,student_user_id")
    .in("class_id", effectiveClassIds);

  const scopedStudentIds = Array.from(
    new Set((memberRows ?? []).map((row) => String(row.student_user_id))),
  );
  if (scopedStudentIds.length === 0) {
    return NextResponse.json({
      classes: classesData ?? [],
      students: [],
      summary: { totalAnswered: 0, totalCorrect: 0, overallAccuracy: 0 },
      byStandard: [],
      byStudent: [],
    });
  }

  const effectiveStudentIds =
    studentId && scopedStudentIds.includes(studentId)
      ? [studentId]
      : scopedStudentIds;

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id,display_name,student_id")
    .in("id", scopedStudentIds);

  const studentMap = new Map<string, string>();
  for (const profile of profileRows ?? []) {
    studentMap.set(
      String(profile.id),
      String(profile.display_name || profile.student_id || profile.id),
    );
  }

  let attemptsQuery = supabase
    .from("attempts")
    .select("user_id,standard_id,standard_label,is_correct,time_spent_sec,answered_at")
    .in("user_id", effectiveStudentIds);
  if (range !== "all") {
    const days = range === "7d" ? 7 : 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    attemptsQuery = attemptsQuery.gte("answered_at", from.toISOString());
  }
  const { data: attemptsData } = await attemptsQuery;
  const attempts = (attemptsData ?? []) as AttemptRow[];

  const totalAnswered = attempts.length;
  const totalCorrect = attempts.filter((item) => item.is_correct).length;
  const overallAccuracy =
    totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const byStandardMap = new Map<
    string,
    { standardId: string; standardLabel: string; attempted: number; correct: number; totalTime: number }
  >();
  for (const row of attempts) {
    const standardId = row.standard_id || "BIO.OTHER";
    const standardLabel = row.standard_label || "Other";
    const existing = byStandardMap.get(standardId) ?? {
      standardId,
      standardLabel,
      attempted: 0,
      correct: 0,
      totalTime: 0,
    };
    existing.attempted += 1;
    if (row.is_correct) existing.correct += 1;
    existing.totalTime += row.time_spent_sec ?? 0;
    byStandardMap.set(standardId, existing);
  }

  const byStandard = Array.from(byStandardMap.values())
    .map((item) => ({
      standardId: item.standardId,
      standardLabel: item.standardLabel,
      attempted: item.attempted,
      correct: item.correct,
      accuracy: item.attempted > 0 ? Math.round((item.correct / item.attempted) * 100) : 0,
      averageTimeSec: item.attempted > 0 ? Math.round(item.totalTime / item.attempted) : 0,
    }))
    .sort((a, b) => a.standardId.localeCompare(b.standardId));

  const byStudentMap = new Map<string, { studentId: string; label: string; totalAnswered: number; totalCorrect: number }>();
  for (const row of attempts) {
    const key = row.user_id;
    const existing = byStudentMap.get(key) ?? {
      studentId: key,
      label: studentMap.get(key) ?? key,
      totalAnswered: 0,
      totalCorrect: 0,
    };
    existing.totalAnswered += 1;
    if (row.is_correct) existing.totalCorrect += 1;
    byStudentMap.set(key, existing);
  }

  const byStudent = Array.from(byStudentMap.values())
    .map((item) => ({
      studentId: item.studentId,
      label: item.label,
      totalAnswered: item.totalAnswered,
      totalCorrect: item.totalCorrect,
      accuracy:
        item.totalAnswered > 0
          ? Math.round((item.totalCorrect / item.totalAnswered) * 100)
          : 0,
    }))
    .sort((a, b) => b.totalAnswered - a.totalAnswered);

  const students = effectiveStudentIds.map((id) => ({
    id,
    label: studentMap.get(id) ?? id,
  }));

  return NextResponse.json({
    classes: (classesData ?? []).map((item) => ({ id: item.id, name: item.name })),
    students,
    summary: { totalAnswered, totalCorrect, overallAccuracy },
    byStandard,
    byStudent,
  });
}

