"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Award } from "lucide-react";
import { useDialogFocusTrap } from "@/components/short-answer/useDialogFocusTrap";
import { ConfettiBurst } from "@/components/badges/ConfettiBurst";
import type { EarnedBadgeSummary } from "@/types/badges";

function BadgeArt({ icon }: { icon: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return (
      <span
        className="flex h-28 w-28 items-center justify-center rounded-full"
        style={{ background: "var(--assignment-mode-review-bg)" }}
      >
        <Award className="h-14 w-14" style={{ color: "var(--assignment-mode-review)" }} />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- badge art is a small, unoptimized fixed-size icon
    <img
      src={`/badges/${icon}`}
      alt=""
      className="h-28 w-28 object-contain"
      onError={() => setImageFailed(true)}
    />
  );
}

export function BadgeCelebrationModal({
  badge,
  onDismiss,
}: {
  badge: EarnedBadgeSummary;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  const dialogRef = useDialogFocusTrap<HTMLDivElement>();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onDismiss}
      role="presentation"
    >
      <ConfettiBurst />

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="badge-celebration-title"
        className="relative z-[101] w-full max-w-sm rounded-3xl border p-6 text-center shadow-2xl sm:p-8"
        style={{
          background: "var(--surface)",
          borderColor: "var(--assignment-glass-border)",
          boxShadow: "var(--assignment-card-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--muted-foreground)" }}
        >
          You earned a new badge!
        </p>

        <motion.div
          className="mx-auto mt-4 flex h-28 w-28 items-center justify-center"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
        >
          <BadgeArt icon={badge.icon} />
        </motion.div>

        <h2
          id="badge-celebration-title"
          className="mt-4 font-heading text-xl font-bold text-heading"
        >
          {badge.name}!
        </h2>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-bold transition duration-200 hover:-translate-y-px active:translate-y-0"
          style={{
            fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
            color: "var(--assignment-row-cta-text)",
            background: "var(--assignment-row-cta-bg)",
            border: "1.5px solid var(--assignment-row-cta-border)",
            boxShadow: "var(--assignment-row-cta-shadow)",
          }}
        >
          Nice!
        </button>
      </div>
    </div>
  );
}
