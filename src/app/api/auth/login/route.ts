import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveRole } from "@/lib/auth/role";
import { studentIdToLoginEmail } from "@/lib/auth/student-id";

type AppRole = "student" | "teacher" | "admin";

function getPostLoginPath(role: AppRole | null) {
  if (role === "admin") return "/content/accounts";
  if (role === "teacher") return "/teacher-dashboard";
  return "/";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      studentId?: string;
      password?: string;
    };
    const studentId = body.studentId?.trim();
    const password = body.password?.trim();

    if (!studentId || !password) {
      return NextResponse.json(
        { error: "Please enter both studentID and password." },
        { status: 400 },
      );
    }

    const email = studentIdToLoginEmail(studentId);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return NextResponse.json(
        { error: "Login failed. Please check your ID and password." },
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

    let role = resolveRole(profile?.role, user);
    if (!role) {
      const admin = createSupabaseAdminClient();
      const { data: adminProfile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      role = resolveRole(adminProfile?.role, user);
    }

    return NextResponse.json({ ok: true, redirectTo: getPostLoginPath(role) });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred during login." },
      { status: 500 },
    );
  }
}

