import { NextResponse } from "next/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  const studentId = url.searchParams.get("studentId") || undefined;
  const range = (url.searchParams.get("range") as "7d" | "30d" | "all" | null) ?? "30d";

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
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
  const role = await resolveRoleWithServerFallback(user, currentProfile?.role);
  if (!role || !["teacher", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all schools the teacher has access to
  let schoolIds: string[] = [];
  if (role === "teacher") {
    const [{ data: schoolTeachers }, { data: legacySchools }] = await Promise.all([
      admin
        .from("school_teachers")
        .select("school_id")
        .eq("teacher_user_id", user.id),
      admin.from("schools").select("id").eq("teacher_user_id", user.id),
    ]);
    schoolIds = Array.from(
      new Set([
        ...(schoolTeachers ?? []).map((row) => row.school_id),
        ...(legacySchools ?? []).map((row) => row.id),
      ]),
    );
  } else {
    const { data: allSchools } = await admin
      .from("schools")
      .select("id")
      .order("name", { ascending: true });
    schoolIds = (allSchools ?? []).map((row) => row.id);
  }

  if (schoolIds.length === 0) {
    return NextResponse.json({
      students: [],
      summary: { totalAnswered: 0, totalCorrect: 0, overallAccuracy: 0 },
      byStandard: [],
      byStudent: [],
    });
  }

  const { data: memberRows } = await admin
    .from("school_members")
    .select("school_id,student_user_id")
    .in("school_id", schoolIds);

  const scopedStudentIds = Array.from(
    new Set((memberRows ?? []).map((row) => String(row.student_user_id))),
  );
  if (scopedStudentIds.length === 0) {
    return NextResponse.json({
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

  const { data: profileRows } = await admin
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

  let attemptsQuery = admin
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
    students,
    summary: { totalAnswered, totalCorrect, overallAccuracy },
    byStandard,
    byStudent,
  });
}
