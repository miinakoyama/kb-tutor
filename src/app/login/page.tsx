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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section
        className="w-full max-w-md rounded-[28px] p-7 sm:p-8"
        style={{
          background: "var(--assignment-glass-bg-strong)",
          border: "1px solid var(--assignment-glass-border)",
          boxShadow: "var(--assignment-elevated-shadow)",
          backdropFilter: "blur(14px) saturate(115%)",
          WebkitBackdropFilter: "blur(14px) saturate(115%)",
        }}
      >
        <h1
          className="font-heading font-bold text-heading"
          style={{ fontSize: 26, letterSpacing: -0.4, lineHeight: 1.25 }}
        >
          Student Login
        </h1>
        <p className="mt-1.5 mb-7 text-sm text-muted-foreground">
          Select your school and enter your student ID.
        </p>
        <form onSubmit={onSubmit} className="space-y-5">
          <label className="block">
            <span className="text-sm font-semibold text-slate-gray">School</span>
            {!schoolsLoaded ? (
              <p className="mt-1.5 text-sm text-muted-foreground">Loading schools...</p>
            ) : schoolLoadError ? (
              <div className="mt-1.5 space-y-2">
                <p className="text-sm text-error">{schoolLoadError}</p>
                <button
                  type="button"
                  onClick={() => void loadSchools()}
                  className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition hover:bg-[var(--assignment-row-cta-bg-hover)]"
                  style={{
                    color: "var(--assignment-row-cta-text)",
                    background: "var(--assignment-row-cta-bg)",
                    border: "1px solid var(--assignment-row-cta-border)",
                  }}
                >
                  Retry loading schools
                </button>
              </div>
            ) : schools.length === 0 ? (
              <p className="mt-1.5 text-sm text-muted-foreground">
                No schools are available for student login.
              </p>
            ) : (
              <select
                className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                style={{
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border-default)",
                }}
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
            <span className="text-sm font-semibold text-slate-gray">Student ID</span>
            <input
              className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              style={{
                background: "var(--surface-muted)",
                border: "1px solid var(--border-default)",
              }}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              autoComplete="username"
              placeholder="e.g. st000000000"
              required
            />
            {studentLoginNotice && (
              <div
                role="note"
                className="mt-3 rounded-2xl px-3.5 py-3 text-sm text-heading"
                style={{
                  background: "var(--assignment-glass-bg)",
                  border: "1px solid var(--assignment-panel-border)",
                  boxShadow: "var(--assignment-card-shadow)",
                }}
              >
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  School notice
                </p>
                <p className="whitespace-pre-wrap break-words leading-relaxed">{studentLoginNotice}</p>
              </div>
            )}
          </label>
          {error && (
            <p className="rounded-xl border border-error-border bg-error-light px-3.5 py-2.5 text-sm text-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !schoolId}
            className="inline-flex h-[46px] w-full items-center justify-center rounded-full font-bold transition duration-200 hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:hover:brightness-100"
            style={{
              fontSize: 16,
              letterSpacing: 0.3,
              color: "var(--assignment-cta-text)",
              background: "var(--assignment-cta-bg-strong)",
              border: "1.5px solid var(--assignment-glass-border)",
              boxShadow: "var(--assignment-cta-elevated-shadow)",
              fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
            }}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-7 text-center text-sm text-muted-foreground">
          Teacher or admin?{" "}
          <Link
            href="/login/staff"
            className="font-semibold transition hover:brightness-110"
            style={{ color: "var(--assignment-completed)" }}
          >
            Sign in here
          </Link>
        </p>
      </section>
    </main>
  );
}
