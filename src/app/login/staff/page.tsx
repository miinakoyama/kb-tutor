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
          Staff Login
        </h1>
        <p className="mt-1.5 mb-7 text-sm text-muted-foreground">
          Sign in with your email and password.
        </p>
        <form onSubmit={onSubmit} className="space-y-5">
          <label className="block">
            <span className="text-sm font-semibold text-slate-gray">Email</span>
            <input
              className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              style={{
                background: "var(--surface-muted)",
                border: "1px solid var(--border-default)",
              }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="teacher@school.example"
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-gray">Password</span>
            <input
              className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              style={{
                background: "var(--surface-muted)",
                border: "1px solid var(--border-default)",
              }}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="rounded-xl border border-error-border bg-error-light px-3.5 py-2.5 text-sm text-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
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
          Student?{" "}
          <Link
            href="/login"
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
