import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { studentIdToLoginEmail } from "@/lib/auth/student-id";

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

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred during login." },
      { status: 500 },
    );
  }
}

