"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface School {
  id: string;
  name: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/public/schools");
        if (response.ok) {
          const json = (await response.json()) as { schools?: School[] };
          setSchools(json.schools ?? []);
          if ((json.schools ?? []).length > 0) {
            setSchoolId(json.schools![0].id);
          }
        }
      } catch {
        // Non-critical — school list stays empty, user can still try
      }
    })();
  }, []);

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
    <main className="min-h-screen flex items-center justify-center bg-sand-beige px-4">
      <section className="w-full max-w-md rounded-2xl border border-[#16a34a]/25 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#14532d] mb-2">Student Login</h1>
        <p className="text-sm text-slate-gray/70 mb-6">
          Select your school and enter your student ID.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-gray">School</span>
            {schools.length === 0 ? (
              <p className="mt-1 text-sm text-slate-gray/60">Loading schools...</p>
            ) : (
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
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
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              autoComplete="username"
              placeholder="e.g. st000000000"
              required
            />
          </label>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !schoolId}
            className="w-full rounded-lg bg-[#16a34a] px-4 py-2.5 text-white font-medium hover:bg-[#15803d] disabled:opacity-50"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-gray/60">
          Teacher or admin?{" "}
          <Link
            href="/login/staff"
            className="text-[#16a34a] hover:underline font-medium"
          >
            Sign in here
          </Link>
        </p>
      </section>
    </main>
  );
}
