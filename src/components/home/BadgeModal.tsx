"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Award, Lock, UserRound, X } from "lucide-react";
import { BADGE_CATALOG } from "@/lib/badges/catalog";
import { describeBadgeTrigger } from "@/lib/badges/describe-trigger";
import type { StudentBadgeView } from "@/types/badges";
import { useDialogFocusTrap } from "@/components/short-answer/useDialogFocusTrap";

const BADGE_DEFINITION_BY_ID = new Map(BADGE_CATALOG.map((badge) => [badge.id, badge]));

function initialsOf(name: string | null): string {
  if (!name) return "";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatEarnedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface BadgeModalProps {
  studentName: string | null;
  badges: StudentBadgeView[];
  onClose: () => void;
}

export function BadgeModal({ studentName, badges, onClose }: BadgeModalProps) {
  const dialogRef = useDialogFocusTrap<HTMLDivElement>();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const earnedCount = badges.filter((b) => b.earned).length;
  const initials = initialsOf(studentName);
  const selected = badges.find((b) => b.id === selectedId) ?? null;
  const selectedDefinition = selected ? BADGE_DEFINITION_BY_ID.get(selected.id) : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Profile badges"
        className="flex max-h-[85vh] w-full max-w-6xl flex-col rounded-[24px] border p-5 sm:p-6"
        style={{
          background: "var(--surface)",
          borderColor: "var(--assignment-glass-border)",
          boxShadow: "var(--assignment-card-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-heading text-lg font-bold text-heading">Profile</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground transition hover:bg-[var(--assignment-calendar-nav-bg)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-6 sm:flex-row">
          <div className="flex flex-shrink-0 flex-col items-center gap-2 px-6 sm:w-72 sm:px-8">
            <div
              className="flex h-28 w-28 items-center justify-center rounded-full"
              style={{ background: "var(--assignment-calendar-nav-bg)" }}
            >
              {initials ? (
                <span
                  className="text-3xl font-bold"
                  style={{ color: "var(--assignment-completed)" }}
                >
                  {initials}
                </span>
              ) : (
                <UserRound
                  className="h-12 w-12"
                  style={{ color: "var(--assignment-completed)" }}
                  aria-hidden="true"
                />
              )}
            </div>
            {studentName && (
              <p
                className="text-center font-bold text-heading"
                style={{ fontSize: 17 }}
              >
                {studentName}
              </p>
            )}
            <span
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                background: "var(--mastery-mastered-bg)",
                color: "var(--mastery-mastered)",
              }}
            >
              <Award className="h-3.5 w-3.5" aria-hidden="true" />
              {earnedCount} / {badges.length}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="grid flex-1 auto-rows-min grid-cols-5 gap-3 overflow-y-auto pr-1">
              {badges.map((badge) => {
                const definition = BADGE_DEFINITION_BY_ID.get(badge.id);
                return (
                  <BadgeTile
                    key={badge.id}
                    badge={badge}
                    description={definition ? describeBadgeTrigger(definition.trigger) : ""}
                    selected={badge.id === selectedId}
                    onSelect={() =>
                      setSelectedId((current) => (current === badge.id ? null : badge.id))
                    }
                  />
                );
              })}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {selected && (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="rounded-xl border p-3"
                  style={{
                    borderColor: "var(--border-subtle)",
                    background: "var(--surface-muted)",
                  }}
                >
                  <p className="text-sm font-semibold text-heading">{selected.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selected.earned && selected.earnedAt
                      ? `Earned ${formatEarnedDate(selected.earnedAt)}`
                      : selectedDefinition
                        ? describeBadgeTrigger(selectedDefinition.trigger)
                        : ""}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function BadgeTile({
  badge,
  description,
  selected,
  onSelect,
}: {
  badge: StudentBadgeView;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={badge.earned ? `${badge.name}: earned` : `${badge.name} (locked): ${description}`}
      className="relative flex aspect-square flex-col items-center justify-center rounded-xl p-2 transition hover:brightness-95"
      style={{
        boxShadow: selected ? "0 0 0 2px var(--primary)" : undefined,
      }}
    >
      {imageFailed ? (
        (() => {
          const FallbackIcon = badge.earned ? Award : Lock;
          return (
            <FallbackIcon
              className="h-6 w-6"
              style={{
                color: badge.earned ? "var(--mastery-mastered)" : "var(--muted-foreground)",
              }}
              aria-hidden="true"
            />
          );
        })()
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- badge art is a small, unoptimized fixed-size icon
        <img
          src={`/badges/${badge.icon}`}
          alt=""
          className="h-full w-full object-contain"
          style={{
            opacity: badge.earned ? 1 : 0.35,
            filter: badge.earned ? undefined : "grayscale(1)",
          }}
          onError={() => setImageFailed(true)}
        />
      )}
      {!badge.earned && (
        <span
          className="absolute flex items-center justify-center rounded-full"
          style={{
            width: "46%",
            height: "46%",
            background: "var(--surface)",
            boxShadow: "var(--assignment-card-shadow)",
          }}
        >
          <Lock
            className="h-6 w-6"
            style={{ color: "var(--muted-foreground)" }}
            aria-hidden="true"
          />
        </span>
      )}
    </button>
  );
}
