import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/auth/types";
import {
  ANALYTICS_IN_FILTER_CHUNK_SIZE,
  ANALYTICS_PAGE_SIZE,
  chunkArray,
} from "@/lib/analytics/pagination";
import type { ScopeMode } from "@/lib/analytics/teacher-analytics-types";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface ScopedStudent {
  id: string;
  label: string;
  classId: string | null;
  classLabel: string;
}

export interface TeacherScope {
  schoolIds: string[];
  classes: { id: string; label: string }[];
  studentIds: string[];
  studentMap: Map<string, ScopedStudent>;
}

export interface ResolveTeacherScopeInput {
  admin: SupabaseAdminClient;
  userId: string;
  role: AppRole;
  classIdFilter?: string | null;
  scopeMode?: ScopeMode;
}

/**
 * Build the (schools, students) scope for the requesting teacher/admin.
 *
 * Mirrors the pipeline in `src/app/api/teacher-dashboard/route.ts`:
 *   school_teachers ∪ schools.teacher_user_id → school_members → profiles
 * with `excluded_from_analytics = true` profiles removed.
 *
 * `scopeMode = "all"` widens to every school for admins; for teachers it is
 * silently downgraded to "selected" so callers cannot escalate by toggling
 * the flag.
 */
export async function resolveTeacherScope(
  input: ResolveTeacherScopeInput,
): Promise<TeacherScope> {
  const { admin, userId, role } = input;
  const effectiveScopeMode: ScopeMode =
    role === "admin" && input.scopeMode === "all" ? "all" : "selected";

  let schoolIds: string[] = [];
  if (effectiveScopeMode === "all") {
    const { data, error } = await admin
      .from("schools")
      .select("id")
      .order("name", { ascending: true });
    if (error) {
      throw new Error(`schools query failed: ${error.message}`);
    }
    schoolIds = (data ?? []).map((row) => String(row.id));
  } else if (role === "admin") {
    const { data, error } = await admin
      .from("schools")
      .select("id")
      .order("name", { ascending: true });
    if (error) {
      throw new Error(`schools query failed: ${error.message}`);
    }
    schoolIds = (data ?? []).map((row) => String(row.id));
  } else {
    const [schoolTeachersRes, legacySchoolsRes] = await Promise.all([
      admin
        .from("school_teachers")
        .select("school_id")
        .eq("teacher_user_id", userId),
      admin.from("schools").select("id").eq("teacher_user_id", userId),
    ]);
    if (schoolTeachersRes.error) {
      throw new Error(
        `school_teachers query failed: ${schoolTeachersRes.error.message}`,
      );
    }
    if (legacySchoolsRes.error) {
      throw new Error(
        `legacy schools query failed: ${legacySchoolsRes.error.message}`,
      );
    }
    const ids = new Set<string>();
    (schoolTeachersRes.data ?? []).forEach((row) =>
      ids.add(String(row.school_id)),
    );
    (legacySchoolsRes.data ?? []).forEach((row) => ids.add(String(row.id)));
    schoolIds = Array.from(ids);
  }

  if (schoolIds.length === 0) {
    return {
      schoolIds: [],
      classes: [],
      studentIds: [],
      studentMap: new Map(),
    };
  }

  const { data: schoolRows, error: schoolNameError } = await admin
    .from("schools")
    .select("id,name")
    .in("id", schoolIds);
  if (schoolNameError) {
    throw new Error(
      `school name lookup failed: ${schoolNameError.message}`,
    );
  }
  const schoolNameById = new Map<string, string>();
  for (const row of schoolRows ?? []) {
    schoolNameById.set(String(row.id), String(row.name ?? row.id));
  }
  const classes = Array.from(schoolNameById.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const filterApplies =
    typeof input.classIdFilter === "string" &&
    input.classIdFilter.length > 0 &&
    schoolIds.includes(input.classIdFilter);
  const effectiveClassIds = filterApplies
    ? [input.classIdFilter as string]
    : schoolIds;

  const studentClassMap = new Map<string, string>();
  for (const chunk of chunkArray(
    effectiveClassIds,
    ANALYTICS_IN_FILTER_CHUNK_SIZE,
  )) {
    for (let from = 0; ; from += ANALYTICS_PAGE_SIZE) {
      const { data, error } = await admin
        .from("school_members")
        .select("school_id,student_user_id")
        .in("school_id", chunk)
        .order("student_user_id", { ascending: true })
        .range(from, from + ANALYTICS_PAGE_SIZE - 1);
      if (error) {
        throw new Error(`school_members query failed: ${error.message}`);
      }
      const rows = data ?? [];
      for (const row of rows) {
        const sid = String(row.student_user_id);
        if (!studentClassMap.has(sid)) {
          studentClassMap.set(sid, String(row.school_id));
        }
      }
      if (rows.length < ANALYTICS_PAGE_SIZE) break;
    }
  }

  const scopedStudentIds = Array.from(studentClassMap.keys());
  if (scopedStudentIds.length === 0) {
    return {
      schoolIds,
      classes,
      studentIds: [],
      studentMap: new Map(),
    };
  }

  const studentMap = new Map<string, ScopedStudent>();
  for (const chunk of chunkArray(
    scopedStudentIds,
    ANALYTICS_IN_FILTER_CHUNK_SIZE,
  )) {
    const { data, error } = await admin
      .from("profiles")
      .select("id,display_name,student_id,excluded_from_analytics")
      .in("id", chunk);
    if (error) {
      throw new Error(`profiles query failed: ${error.message}`);
    }
    for (const profile of data ?? []) {
      const id = String(profile.id);
      if (profile.excluded_from_analytics === true) continue;
      const classId = studentClassMap.get(id) ?? null;
      const classLabel = classId
        ? (schoolNameById.get(classId) ?? classId)
        : "";
      studentMap.set(id, {
        id,
        label: String(profile.display_name || profile.student_id || id),
        classId,
        classLabel,
      });
    }
  }

  return {
    schoolIds,
    classes,
    studentIds: Array.from(studentMap.keys()),
    studentMap,
  };
}
