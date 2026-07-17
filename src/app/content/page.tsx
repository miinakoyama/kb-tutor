"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Edit3, Sparkles, ChevronRight, ShieldCheck } from "lucide-react";

export default function ContentPage() {
  const [scopeLabel, setScopeLabel] = useState("My content");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const loadRole = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          profile?: { role?: string } | null;
          user?: {
            user_metadata?: { role?: string };
            app_metadata?: { role?: string };
          } | null;
        };
        const role =
          payload.profile?.role ??
          payload.user?.user_metadata?.role ??
          payload.user?.app_metadata?.role;
        setScopeLabel(role === "admin" ? "All content" : "My content");
        setIsAdmin(role === "admin");
      } catch {
        setScopeLabel("My content");
      }
    };
    void loadRole();
  }, []);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading mb-2">
          Contents Management
        </h1>
        <p className="text-muted-foreground max-w-3xl">
          This workspace is dedicated to question content operations. Choose a workflow below
          to curate existing sets or generate new sets at scale.
        </p>
        <p className="text-xs text-muted-foreground mt-2">Scope: {scopeLabel}</p>
      </header>

      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-gray mb-3">Primary Workflows</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/content/questions"
            className="rounded-xl border border-primary/30 bg-surface p-6 shadow-sm hover:border-primary hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Edit3 className="w-6 h-6 text-primary" />
                <h2 className="font-medium text-slate-gray">Question Manager</h2>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-gray/30 group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Review, edit, and organize existing question sets.
            </p>
            <p className="text-xs text-muted-foreground">
              Best for quality control, updates, and final checks.
            </p>
          </Link>

          <Link
            href="/content/mass-production"
            className="rounded-xl border border-primary/30 bg-surface p-6 shadow-sm hover:border-primary hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-primary" />
                <h2 className="font-medium text-slate-gray">LLM Mass Production</h2>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-gray/30 group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Generate large volumes of question sets with AI.
            </p>
            <p className="text-xs text-muted-foreground">
              Best for fast drafting before review in Question Manager.
            </p>
          </Link>
        </div>
      </section>

      {isAdmin && (
      <section className="mb-8 border-t border-border-default pt-6">
        <h2 className="mb-3 text-base font-semibold text-slate-gray">Governance</h2>
        <Link
          href="/content/kc-coverage"
          className="flex items-center justify-between border border-border-default bg-surface p-4 hover:border-primary"
        >
          <span className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-medium text-slate-gray">KC Coverage</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>
      </section>
      )}

      <section className="rounded-xl border border-border-default bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Recommended Flow
        </h2>
        <div className="grid gap-3 md:grid-cols-3 text-sm">
          <article className="rounded-lg border border-border-default p-3">
            <p className="font-medium text-slate-gray mb-1">1. Generate</p>
            <p className="text-muted-foreground">Create drafts in LLM Mass Production.</p>
          </article>
          <article className="rounded-lg border border-border-default p-3">
            <p className="font-medium text-slate-gray mb-1">2. Review</p>
            <p className="text-muted-foreground">Refine sets in Question Manager.</p>
          </article>
          <article className="rounded-lg border border-border-default p-3">
            <p className="font-medium text-slate-gray mb-1">3. Publish</p>
            <p className="text-muted-foreground">Use approved sets in assignments.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
