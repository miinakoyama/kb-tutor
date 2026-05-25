"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface School {
  id: string;
  name: string;
  student_login_notice?: string | null;
}

export default function LoginPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [schoolLoadError, setSchoolLoadError] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSchools = useCallback(async () => {
    setSchoolsLoaded(false);
    setSchoolLoadError(null);
    try {
      const response = await fetch("/api/public/schools");
      if (!response.ok) {
        throw new Error("Failed to load schools");
      }
      const json = (await response.json()) as { schools?: School[] };
      const nextSchools = json.schools ?? [];
      setSchools(nextSchools);
      setSchoolId(nextSchools[0]?.id ?? "");
    } catch {
      setSchools([]);
      setSchoolId("");
      setSchoolLoadError("Failed to load schools. Please retry.");
    } finally {
      setSchoolsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  const studentLoginNotice = useMemo(() => {
    const school = schools.find((s) => s.id === schoolId);
    const raw = school?.student_login_notice;
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [schools, schoolId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "student", schoolId, studentId }),
      });
      const json = (await response.json()) as { error?: string; redirectTo?: string };
      if (!response.ok) {
        setError(json.error ?? "Login failed.");
        return;
      }
      router.push(json.redirectTo || "/");
      router.refresh();
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <section className="w-full max-w-md rounded-2xl border border-primary/25 bg-surface p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-heading mb-2">Student Login</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Select your school and enter your student ID.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-gray">School</span>
            {!schoolsLoaded ? (
              <p className="mt-1 text-sm text-muted-foreground">Loading schools...</p>
            ) : schoolLoadError ? (
              <div className="mt-1 space-y-2">
                <p className="text-sm text-error">{schoolLoadError}</p>
                <button
                  type="button"
                  onClick={() => void loadSchools()}
                  className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted"
                >
                  Retry loading schools
                </button>
              </div>
            ) : schools.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                No schools are available for student login.
              </p>
            ) : (
              <select
                className="mt-1 w-full rounded-lg border border-border-default px-3 py-2"
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select your school
                </option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-gray">Student ID</span>
            <input
              className="mt-1 w-full rounded-lg border border-border-default px-3 py-2"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              autoComplete="username"
              placeholder="e.g. st000000000"
              required
            />
            {studentLoginNotice && (
              <div
                role="note"
                className="mt-3 rounded-lg border border-primary/35 bg-primary-light px-3 py-3 text-sm text-heading shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-hover/90 mb-1.5">
                  School notice
                </p>
                <p className="whitespace-pre-wrap break-words leading-relaxed">{studentLoginNotice}</p>
              </div>
            )}
          </label>
          {error && (
            <p className="rounded-lg border border-error-border bg-error-light px-3 py-2 text-sm text-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !schoolId}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-white font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Teacher or admin?{" "}
          <Link
            href="/login/staff"
            className="text-primary hover:underline font-medium"
          >
            Sign in here
          </Link>
        </p>
      </section>
    </main>
  );
}
