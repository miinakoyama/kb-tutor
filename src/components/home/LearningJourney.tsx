"use client";

import { useState } from "react";
import Link from "next/link";
import type { TopicKcCoverage } from "@/lib/homepage/kc-coverage";
import { RingProgress } from "@/components/home/RingProgress";

const CARD_WIDTH = 136;
const CARD_HEIGHT = 154;

function TopicCard({ topic }: { topic: TopicKcCoverage }) {
  const hasKcData = topic.totalCount > 0;
  const ratio = hasKcData ? topic.practicedCount / topic.totalCount : 0;

  return (
    <Link
      href="/progress"
      className="flex flex-shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl p-3 text-center transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      style={{
        width: CARD_WIDTH,
        minHeight: CARD_HEIGHT,
        background: "var(--assignment-glass-bg)",
        border: "1px solid var(--assignment-glass-border)",
        boxShadow: "var(--assignment-card-shadow)",
      }}
    >
      <p
        className="line-clamp-2 flex w-full items-center justify-center font-semibold text-slate-gray"
        style={{
          fontSize: 12,
          minHeight: "2.2em",
          fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
        }}
      >
        {topic.category}
      </p>

      {hasKcData ? (
        <>
          <RingProgress ratio={ratio} size={48} strokeWidth={5}>
            <span
              className="font-bold text-slate-gray"
              style={{ fontSize: 12, fontFamily: "var(--font-geist), ui-sans-serif, sans-serif" }}
            >
              {Math.round(ratio * 100)}%
            </span>
          </RingProgress>
          <p className="text-[10px] text-muted-foreground">
            {topic.practicedCount} of {topic.totalCount} KCs
          </p>
        </>
      ) : (
        <p className="text-[10px] text-muted-foreground">No KC data</p>
      )}
    </Link>
  );
}

export function LearningJourney({ topics }: { topics: TopicKcCoverage[] }) {
  const modules = Array.from(new Set(topics.map((topic) => topic.module)));
  const [activeModule, setActiveModule] = useState(modules[0]);
  const visibleTopics = topics.filter((topic) => topic.module === activeModule);

  return (
    <section className="mt-6">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <h2
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--muted-foreground)" }}
        >
          My Learning Journey
        </h2>
        <Link
          href="/progress"
          className="text-sm font-semibold transition hover:brightness-110"
          style={{ color: "var(--assignment-completed)" }}
        >
          My Progress →
        </Link>
      </div>

      <div
        className="flex flex-col gap-3 rounded-[24px] p-4"
        style={{
          background: "var(--assignment-glass-bg)",
          border: "1px solid var(--assignment-glass-border)",
          boxShadow: "var(--assignment-card-shadow)",
        }}
      >
        {modules.length > 1 && (
          <div role="tablist" aria-label="Module" className="flex items-center gap-2">
            {modules.map((module) => {
              const isActive = module === activeModule;
              return (
                <button
                  key={module}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveModule(module)}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  style={
                    isActive
                      ? {
                          background: "var(--assignment-completed)",
                          color: "var(--assignment-on-accent)",
                        }
                      : {
                          background: "var(--assignment-row-cta-bg)",
                          color: "var(--muted-foreground)",
                          border: "1px solid var(--assignment-row-cta-border)",
                        }
                  }
                >
                  Module {module}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-3" style={{ minHeight: CARD_HEIGHT }}>
          {visibleTopics.map((topic) => (
            <TopicCard key={topic.key} topic={topic} />
          ))}
        </div>
      </div>
    </section>
  );
}
