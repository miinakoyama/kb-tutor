import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import {
  STUDENT_VIEW_SCHOOL_ID_COOKIE,
  STUDENT_VIEW_SCHOOL_NAME_COOKIE,
} from "@/lib/student-view";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;

async function requireStaff() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = await resolveRoleWithServerFallback(user, profile?.role);
  if (role !== "teacher" && role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, userId: user.id, role };
}

export async function POST(request: Request) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const body = (await request.json()) as { schoolId?: string; schoolName?: string };
  const schoolId = body.schoolId?.trim();
  const schoolName = body.schoolName?.trim() || "Selected school";
  if (!schoolId) {
    return NextResponse.json({ error: "Missing school id." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let schoolAllowed = false;
  if (guard.role === "admin") {
    const { data: schoolRow } = await admin
      .from("schools")
      .select("id")
      .eq("id", schoolId)
      .maybeSingle();
    schoolAllowed = Boolean(schoolRow);
  } else {
    const [{ data: scopedTeacher }, { data: scopedLegacy }] = await Promise.all([
      admin
        .from("school_teachers")
        .select("school_id")
        .eq("teacher_user_id", guard.userId)
        .eq("school_id", schoolId)
        .maybeSingle(),
      admin
        .from("schools")
        .select("id")
        .eq("teacher_user_id", guard.userId)
        .eq("id", schoolId)
        .maybeSingle(),
    ]);
    schoolAllowed = Boolean(scopedTeacher || scopedLegacy);
  }

  if (!schoolAllowed) {
    return NextResponse.json({ error: "This school is not available." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(STUDENT_VIEW_SCHOOL_ID_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  response.cookies.set(
    STUDENT_VIEW_SCHOOL_NAME_COOKIE,
    encodeURIComponent(schoolName),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    },
  );
  return response;
}

export async function DELETE() {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(STUDENT_VIEW_SCHOOL_ID_COOKIE);
  response.cookies.delete(STUDENT_VIEW_SCHOOL_NAME_COOKIE);
  return response;
}
