"use client";

import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";

interface OptionButtonProps {
  option: { id: string; text: string; feedback?: string };
  isSelected: boolean;
  showCorrect: boolean;
  showWrong: boolean;
  isAnswered: boolean;
  onSelect: (optionId: string) => void;
  showFeedbackIcon?: boolean;
  pendingSelection?: boolean;
  compact?: boolean;
}

export function OptionButton({
  option,
  isSelected,
  showCorrect,
  showWrong,
  isAnswered,
  onSelect,
  showFeedbackIcon = false,
  pendingSelection = false,
  compact = false,
}: OptionButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  const shouldShowIcon =
    showFeedbackIcon && isAnswered && Boolean(option.feedback);
  const tooltipHeading = showCorrect
    ? "Why this is correct"
    : "Why this is incorrect";

  useEffect(() => {
    if (!showTooltip) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        iconRef.current &&
        !iconRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip]);

  // State colors are class-driven (arbitrary-value utilities) so hover/focus
  // styles can win — inline style would override them.
  const stateClasses = showCorrect
    ? "border-[var(--assignment-completed)] bg-[var(--mastery-mastered-bg)]"
    : showWrong
      ? "border-[var(--error-color)] bg-[var(--error-light)]"
      : isSelected
        ? "border-[var(--assignment-completed)] bg-[var(--assignment-calendar-nav-bg)]"
        : "border-[var(--border-default)] bg-surface";

  const getBadgeStyles = () => {
    if (showCorrect || showWrong || isSelected) {
      return {
        backgroundColor: showWrong ? "var(--error-color)" : "var(--assignment-completed)",
        color: "var(--assignment-on-accent)",
      };
    }
    return {
      backgroundColor: "var(--surface-muted)",
      color: "var(--foreground)",
    };
  };

  const badgeStyles = getBadgeStyles();

  const isDisabled = isAnswered && !pendingSelection;

  return (
    <div className="relative">
      <button
        onClick={() => onSelect(option.id)}
        disabled={isDisabled}
        className={`group w-full text-left rounded-2xl transition-all duration-200 break-words flex items-center ${
          compact
            ? "border-[1.5px] px-3 py-2 min-h-[44px] gap-2.5"
            : "border-2 px-5 py-4 min-h-[64px] gap-3.5"
        } ${stateClasses} ${
          isDisabled
            ? "cursor-default"
            : `cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                isSelected
                  ? ""
                  : "hover:border-[var(--assignment-selectable-border)] hover:bg-[var(--assignment-calendar-nav-bg)]"
              }`
        }`}
      >
        <span
          className={`${compact ? "w-7 h-7 text-xs" : "w-8 h-8 text-sm"} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}
          style={badgeStyles}
        >
          {option.id}
        </span>
        <span className={`flex-1 text-slate-gray ${compact ? "text-sm" : "text-[15px]"}`}>{option.text}</span>

        {shouldShowIcon && (
          <span
            ref={iconRef}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip(!showTooltip);
            }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => {
              // Only close on mouse leave for pointer devices; touch has no hover state
              if (window.matchMedia("(hover: hover)").matches) setShowTooltip(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                setShowTooltip(!showTooltip);
              }
            }}
            className={`relative before:absolute before:-inset-2 flex-shrink-0 rounded-full text-muted-foreground hover:text-muted-foreground hover:bg-foreground/10 transition-colors cursor-pointer flex items-center justify-center ${
              compact ? "w-7 h-7" : "w-8 h-8"
            }`}
            aria-label={tooltipHeading}
          >
            <Info className="w-4 h-4" />
          </span>
        )}
      </button>

      {shouldShowIcon && showTooltip && (
        <div
          ref={tooltipRef}
          className="absolute right-0 top-full mt-1 z-20 w-64 max-w-[90vw] p-3 rounded-lg border"
          style={{
            background: "var(--assignment-popover-bg)",
            borderColor: "var(--assignment-popover-border)",
            boxShadow: "var(--assignment-popover-shadow)",
            backdropFilter: "blur(14px) saturate(115%)",
            WebkitBackdropFilter: "blur(14px) saturate(115%)",
          }}
        >
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground mb-1">
            {tooltipHeading}
          </p>
          <p className="text-sm text-slate-gray leading-relaxed">
            {option.feedback?.replace(/^(Correct\.|Incorrect\.)\s*/i, "").trim()}
          </p>
        </div>
      )}
    </div>
  );
}
