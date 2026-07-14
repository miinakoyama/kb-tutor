import type { ReactNode } from "react";

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function RingProgress({
  ratio,
  size = 64,
  strokeWidth = 6,
  children,
}: {
  /** 0–1. Values outside that range are clamped. */
  ratio: number;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
}) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const offset = CIRCUMFERENCE * (1 - clamped);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" className="-rotate-90">
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          stroke="var(--assignment-progress-fill)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 300ms ease-out" }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      )}
    </div>
  );
}
