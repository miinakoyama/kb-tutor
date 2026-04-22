import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRoleWithServerFallback } from "@/lib/auth/server-role";
import {
  normalizeStudentId,
  validateStudentIdAgainstRule,
} from "@/lib/auth/student-id";

type AppRole = "student" | "teacher" | "admin";

function getPostLoginPath(role: AppRole | null) {
  if (role === "admin") return "/content/accounts";
  if (role === "teacher") return "/teacher-dashboard";
  return "/";
}

// Builds the internal Supabase auth email for a student account.
// Format: {schoolId}_{studentId}@student.local
function buildStudentEmail(schoolId: string, studentId: string): string {
  // Sanitize to ensure email-safe characters only
  const safePart = `${schoolId}_${studentId}`.replace(/[^a-zA-Z0-9_\-.]/g, "-");
  return `${safePart}@student.local`;
}

// Internal password for student accounts: never shown to the student
function buildStudentPassword(schoolId: string, studentId: string): string {
  return `${schoolId}_${studentId}`;
}

async function handleStudentLogin(body: {
  schoolId?: string;
  studentId?: string;
}) {
  const schoolId = body.schoolId?.trim();
  const studentId = normalizeStudentId(body.studentId ?? "");

  if (!schoolId || !studentId) {
    return NextResponse.json(
      { error: "Please select a school and enter your student ID." },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: schoolRow, error: schoolError } = await admin
    .from("schools")
    .select("id,is_hidden,student_id_validation_pattern,student_id_validation_hint")
    .eq("id", schoolId)
    .maybeSingle();

  if (schoolError || !schoolRow || schoolRow.is_hidden) {
    return NextResponse.json(
      { error: "School not found." },
      { status: 404 },
    );
  }

  const validationResult = validateStudentIdAgainstRule(studentId, {
    pattern: schoolRow.student_id_validation_pattern,
    hint: schoolRow.student_id_validation_hint,
  });
  if (!validationResult.isValid) {
    return NextResponse.json(
      { error: validationResult.reason ?? "Invalid student ID format." },
      { status: 400 },
    );
  }

  // Look up whether this student already has an account in this school
  const { data: memberRows } = await admin
    .from("school_members")
    .select("student_user_id, profiles!inner(id, email, student_id)")
    .eq("school_id", schoolId)
    .ilike("profiles.student_id", studentId);

  const existingMember = (memberRows ?? []).find(
    (row) =>
      normalizeStudentId(
        (row.profiles as unknown as { student_id?: string | null }).student_id ?? "",
      ) === studentId,
  );

  const supabase = await createSupabaseServerClient();

  if (existingMember) {
    // Existing account — sign in with the internal email/password
    const profile = existingMember.profiles as unknown as { email: string; student_id?: string };
    const email = profile.email;
    const canonicalStudentId = profile.student_id || studentId;
    const password = buildStudentPassword(schoolId, canonicalStudentId);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return NextResponse.json(
        { error: "Login failed. Please check your school and student ID." },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: true, redirectTo: "/" });
  }

  // No existing account — self-register for this visible school
  const email = buildStudentEmail(schoolId, studentId);
  const password = buildStudentPassword(schoolId, studentId);

  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "student",
      student_id: studentId,
      display_name: studentId,
    },
  });

  if (createError) {
    return NextResponse.json(
      { error: `Failed to create account: ${createError.message}` },
      { status: 500 },
    );
  }

  if (!newUser.user) {
    return NextResponse.json(
      { error: "Failed to create account." },
      { status: 500 },
    );
  }

  // Ensure profile exists whether it's auto-created by DB trigger or not.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: newUser.user.id,
      email,
      student_id: studentId,
      display_name: studentId,
      role: "student",
    },
    { onConflict: "id" },
  );

  if (profileError) {
    // Clean up the auth user if profile insert fails
    await admin.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json(
      { error: `Failed to create profile: ${profileError.message}` },
      { status: 500 },
    );
  }

  // Add to school_members
  const { error: memberError } = await admin.from("school_members").insert({
    school_id: schoolId,
    student_user_id: newUser.user.id,
  });

  if (memberError) {
    await admin.auth.admin.deleteUser(newUser.user.id);
    return NextResponse.json(
      { error: `Failed to register for school: ${memberError.message}` },
      { status: 500 },
    );
  }

  // Sign in the newly created user
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return NextResponse.json(
      { error: "Account created but login failed. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, redirectTo: "/" });
}

async function handleStaffLogin(body: {
  email?: string;
  password?: string;
}) {
  const email = body.email?.trim();
  const password = body.password?.trim();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Please enter your email and password." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json(
      { error: "Login failed. Please check your email and password." },
      { status: 401 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: true, redirectTo: "/" });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = await resolveRoleWithServerFallback(user, profile?.role);

  if (!role || role === "student") {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "This login page is for teachers and admins only." },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true, redirectTo: getPostLoginPath(role) });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      type?: string;
      schoolId?: string;
      studentId?: string;
      email?: string;
      password?: string;
    };

    if (body.type === "staff") {
      return handleStaffLogin(body);
    }

    // Default: student login
    return handleStudentLogin(body);
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred during login." },
      { status: 500 },
    );
  }
}
