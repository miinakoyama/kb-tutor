"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({ type: "staff", email, password }),
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
        <h1 className="text-2xl font-bold text-heading mb-2">Staff Login</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Sign in with your email and password.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-gray">Email</span>
            <input
              className="mt-1 w-full rounded-lg border border-border-default px-3 py-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="teacher@school.example"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-gray">Password</span>
            <input
              className="mt-1 w-full rounded-lg border border-border-default px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="rounded-lg border border-error-border bg-error-light px-3 py-2 text-sm text-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-white font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Student?{" "}
          <Link
            href="/login"
            className="text-primary hover:underline font-medium"
          >
            Sign in here
          </Link>
        </p>
      </section>
    </main>
  );
}
