"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

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

  const fieldClass =
    "mt-2 w-full rounded-xl border border-[#A6A39B]/45 bg-white px-3.5 py-3 text-[16.5px] text-[#26251F] transition-colors placeholder:text-[#A6A39B] focus:border-[#0C6B45] focus:outline-none focus:ring-2 focus:ring-[#0C6B45]/25 disabled:opacity-60";

  return (
    <main className="flex min-h-screen w-full bg-white md:bg-[#F1F3F0]/63">
      {/* Left / illustration area — sits directly on the page background, hidden on mobile */}
      <aside className="relative hidden overflow-hidden md:block md:w-[55%]">
        {/* Illustration centered on the full page height */}
        <Image
          src="/illustrations/login-illustration2.png"
          alt=""
          fill
          priority
          sizes="55vw"
          className="object-contain object-center"
          style={{ transform: "scale(0.689)" }}
        />
      </aside>

      {/* Right / form area — the whole right side is one large white card */}
      <section className="flex flex-1 md:py-6 md:pr-6 lg:py-8 lg:pr-8">
        <div className="flex w-full items-stretch justify-center bg-white px-6 py-10 md:rounded-[24px] md:border md:border-[color:var(--assignment-glass-border)] md:px-10 md:shadow-[var(--assignment-card-shadow)] lg:px-16">
          <div className="flex w-full max-w-[440px] flex-col">
          <div className="my-auto w-full">
          <Image
            src="/illustrations/logo-icon.png"
            alt="BioBridge"
            width={1071}
            height={441}
            priority
            className="mb-6 h-auto w-[98px] opacity-90 mx-auto"
            style={{ transform: "translateY(-50%)" }}
          />

          <h1
            className="font-heading text-[31px] font-bold leading-tight tracking-tight text-[#26251F] text-center"
          >
            Student Login
          </h1>
          <p className="mt-4 text-[16.5px] text-[#73706A] text-center">
            Select your school and enter your student ID.
          </p>

          <form onSubmit={onSubmit} className="mt-12 space-y-8">
            <div>
              <label
                htmlFor="school"
                className="block text-[15.5px] font-semibold text-[#26251F]"
              >
                School
              </label>
              {!schoolsLoaded ? (
                <p className="mt-2 text-[15.5px] text-[#73706A]">Loading schools...</p>
              ) : schoolLoadError ? (
                <div className="mt-2 space-y-2">
                  <p className="text-[15.5px] text-[#c24f44]">{schoolLoadError}</p>
                  <button
                    type="button"
                    onClick={() => void loadSchools()}
                    className="rounded-full border border-[#A6A39B]/45 bg-[#F9F8F4] px-3.5 py-1.5 text-[13px] font-semibold text-[#095536] transition-colors hover:bg-[#E3F0E9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0C6B45]/40"
                  >
                    Retry loading schools
                  </button>
                </div>
              ) : schools.length === 0 ? (
                <p className="mt-2 text-[15.5px] text-[#73706A]">
                  No schools are available for student login.
                </p>
              ) : (
                <select
                  id="school"
                  className={fieldClass}
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
            </div>

            <div>
              <label
                htmlFor="studentId"
                className="block text-[15.5px] font-semibold text-[#26251F]"
              >
                Student ID
              </label>
              <input
                id="studentId"
                className={fieldClass}
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                autoComplete="username"
                placeholder="e.g. st000000000"
                required
              />
              {studentLoginNotice && (
                <div
                  role="note"
                  className="mt-3 rounded-xl border border-[#B8CCE8] bg-[#EDF2FA] px-3.5 py-3 text-[15.5px] text-[#26251F]"
                >
                  <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[#3A5C96]">
                    School notice
                  </p>
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {studentLoginNotice}
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-[#c24f44]/30 bg-[#c24f44]/10 px-3.5 py-2.5 text-[15.5px] text-[#c24f44]"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !schoolId}
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[#0C6B45] text-[17.5px] font-semibold text-white transition-colors hover:bg-[#095536] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0C6B45] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#0C6B45]"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
          </div>

          <p className="pt-6 text-center text-[15.5px] text-[#73706A]">
            Teacher or admin?{" "}
            <Link
              href="/login/staff"
              className="font-medium text-[#3A5C96] underline-offset-2 transition-colors hover:text-[#3A5C96] hover:underline focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[#4A72B8]/40"
            >
              Sign in here
            </Link>
          </p>
          </div>
        </div>
      </section>
    </main>
  );
}
