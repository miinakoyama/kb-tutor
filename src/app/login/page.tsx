"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, password }),
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
        <h1 className="text-2xl font-bold text-[#14532d] mb-2">Login</h1>
        <p className="text-sm text-slate-gray/70 mb-6">
          Sign in with your student ID or email address.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-gray">Student ID or Email</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              autoComplete="username"
              placeholder="e.g. admin001 or admin001@student.local"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-gray">password</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
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
            disabled={isSubmitting}
            className="w-full rounded-lg bg-[#16a34a] px-4 py-2.5 text-white font-medium hover:bg-[#15803d] disabled:opacity-50"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

