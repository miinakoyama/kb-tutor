"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getOnboardingSteps,
  type OnboardingRole,
  type OnboardingStep,
} from "@/lib/onboarding-tour";

const VIEWPORT_GUTTER = 8;
const SPOTLIGHT_PADDING = 6;
const SPOTLIGHT_RING_RADIUS = 16;
const SPOTLIGHT_MODAL_GAP = 12;
const SPOTLIGHT_MODAL_MAX_WIDTH = 420;

interface FirstLoginOnboardingProps {
  role: OnboardingRole;
  onComplete: () => void;
  onSkip: () => void;
}

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type SpotlightModalPosition = {
  top: number;
  left: number;
  width: number;
};

function toSpotlightRect(step: OnboardingStep): SpotlightRect | null {
  if (typeof window === "undefined" || !step.targetIds || step.targetIds.length === 0) {
    return null;
  }

  const aggregate = {
    top: Number.POSITIVE_INFINITY,
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
    found: false,
  };

  for (const targetId of step.targetIds) {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-tour-id="${targetId}"]`),
    );
    const visibleElement = candidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    });

    if (!visibleElement) continue;

    const rect = visibleElement.getBoundingClientRect();
    aggregate.top = Math.min(aggregate.top, rect.top);
    aggregate.left = Math.min(aggregate.left, rect.left);
    aggregate.right = Math.max(aggregate.right, rect.right);
    aggregate.bottom = Math.max(aggregate.bottom, rect.bottom);
    aggregate.found = true;
  }

  if (!aggregate.found) return null;

  const top = Math.max(VIEWPORT_GUTTER, aggregate.top - SPOTLIGHT_PADDING);
  const left = Math.max(VIEWPORT_GUTTER, aggregate.left - SPOTLIGHT_PADDING);
  const right = Math.min(
    window.innerWidth - VIEWPORT_GUTTER,
    aggregate.right + SPOTLIGHT_PADDING,
  );
  const bottom = Math.min(
    window.innerHeight - VIEWPORT_GUTTER,
    aggregate.bottom + SPOTLIGHT_PADDING,
  );

  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function toSpotlightModalPosition(
  rect: SpotlightRect,
  cardHeight: number,
): SpotlightModalPosition {
  const width = Math.min(
    SPOTLIGHT_MODAL_MAX_WIDTH,
    window.innerWidth - VIEWPORT_GUTTER * 2,
  );
  const maxLeft = Math.max(
    VIEWPORT_GUTTER,
    window.innerWidth - width - VIEWPORT_GUTTER,
  );
  const left = Math.min(maxLeft, Math.max(VIEWPORT_GUTTER, rect.left));

  const belowTop = rect.top + rect.height + SPOTLIGHT_MODAL_GAP;
  const canPlaceBelow =
    belowTop + cardHeight <= window.innerHeight - VIEWPORT_GUTTER;
  const aboveTop = rect.top - cardHeight - SPOTLIGHT_MODAL_GAP;
  const canPlaceAbove = aboveTop >= VIEWPORT_GUTTER;

  let top = belowTop;
  if (!canPlaceBelow && canPlaceAbove) {
    top = aboveTop;
  } else if (!canPlaceBelow && !canPlaceAbove) {
    const centeredTop = rect.top + rect.height / 2 - cardHeight / 2;
    const maxTop = Math.max(
      VIEWPORT_GUTTER,
      window.innerHeight - cardHeight - VIEWPORT_GUTTER,
    );
    top = Math.min(maxTop, Math.max(VIEWPORT_GUTTER, centeredTop));
  }

  return { top, left, width };
}

export function FirstLoginOnboarding({
  role,
  onComplete,
  onSkip,
}: FirstLoginOnboardingProps) {
  const router = useRouter();
  const pathname = usePathname();
  const steps = useMemo(() => getOnboardingSteps(role), [role]);
  const [stepIndex, setStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [spotlightModalPosition, setSpotlightModalPosition] =
    useState<SpotlightModalPosition | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const isSpotlightStep = currentStep.type === "spotlight";

  useEffect(() => {
    setStepIndex(0);
  }, [role]);

  useEffect(() => {
    const update = () => setSpotlightRect(toSpotlightRect(currentStep));

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [currentStep]);

  useEffect(() => {
    if (currentStep.type !== "spotlight" || !currentStep.routePath) return;
    if (pathname !== currentStep.routePath) {
      router.push(currentStep.routePath);
    }
  }, [currentStep, pathname, router]);

  useEffect(() => {
    if (!isSpotlightStep || !spotlightRect) {
      setSpotlightModalPosition(null);
      return;
    }

    const update = () => {
      const cardHeight = cardRef.current?.offsetHeight ?? 260;
      setSpotlightModalPosition(toSpotlightModalPosition(spotlightRect, cardHeight));
    };

    update();
    const rafId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(rafId);
  }, [isSpotlightStep, spotlightRect, stepIndex]);

  const nextLabel =
    isLastStep ? (currentStep.primaryActionLabel ?? "Finish tour") : "Next";

  const spotlightCardStyle: CSSProperties | undefined =
    isSpotlightStep && spotlightModalPosition
      ? {
          position: "fixed",
          top: spotlightModalPosition.top,
          left: spotlightModalPosition.left,
          width: spotlightModalPosition.width,
        }
      : isSpotlightStep
        ? {
            position: "fixed",
            left: VIEWPORT_GUTTER,
            right: VIEWPORT_GUTTER,
            bottom: VIEWPORT_GUTTER,
            maxWidth: SPOTLIGHT_MODAL_MAX_WIDTH,
          }
        : undefined;

  return (
    <div className="fixed inset-0 z-[80]">
      {spotlightRect ? (
        <div
          className="pointer-events-none fixed border-2 border-mint transition-all duration-200"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
            borderRadius: SPOTLIGHT_RING_RADIUS,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.68)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-950/70" />
      )}

      <div
        className={
          isSpotlightStep
            ? "fixed inset-0"
            : "fixed inset-0 flex items-center justify-center px-4 py-6"
        }
      >
        <div
          ref={cardRef}
          style={spotlightCardStyle}
          className={`w-full rounded-2xl border border-primary/20 bg-surface shadow-2xl ${
            isSpotlightStep ? "max-w-none" : "max-w-2xl"
          }`}
        >
          <div className="border-b border-border-subtle px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  Quick tour
                </p>
                <h2 className="text-xl font-bold text-heading">{currentStep.title}</h2>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-forest">
                {stepIndex + 1} / {steps.length}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{currentStep.description}</p>
          </div>

          {currentStep.modeCards && currentStep.modeCards.length > 0 && (
            <div className="px-6 py-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {currentStep.modeCards.map((modeCard) => (
                  <div
                    key={modeCard.label}
                    className="rounded-lg border border-primary/20 bg-primary/5 p-3"
                  >
                    <p className="text-sm font-semibold text-forest">{modeCard.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{modeCard.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-6 py-4">
            <button
              type="button"
              onClick={onSkip}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Skip tour
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                disabled={stepIndex === 0}
                className="rounded-lg border border-border-default px-3 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isLastStep) {
                    onComplete();
                    return;
                  }
                  setStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
                }}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                {nextLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
