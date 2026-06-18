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

  const getBorderColor = () => {
    if (showCorrect) return "var(--primary)";
    if (showWrong) return "var(--error-color)";
    if (isSelected && pendingSelection) return "var(--heading)";
    if (isSelected) return "var(--primary)";
    return "var(--border-default)";
  };

  const getBackgroundColor = () => {
    if (showCorrect) return "var(--primary-light)";
    if (showWrong) return "var(--error-light)";
    if (isSelected) return "var(--primary-light)";
    return "var(--surface)";
  };

  const getBadgeStyles = () => {
    if (showCorrect || showWrong || isSelected) {
      let bgColor = "var(--primary)";
      if (showWrong) bgColor = "var(--error-color)";
      else if (isSelected && pendingSelection) bgColor = "var(--heading)";

      return {
        backgroundColor: bgColor,
        color: "white",
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
        className={`group w-full text-left rounded-xl border-2 transition-all duration-200 break-words flex items-center ${
          compact ? "px-3 py-2 min-h-[40px] gap-2.5" : "px-4 py-3 min-h-[48px] gap-3"
        } ${
          isDisabled
            ? "cursor-default"
            : "cursor-pointer hover:border-[var(--primary-border)] hover:bg-primary-light focus-visible:border-[var(--primary-border)] focus-visible:bg-primary-light focus-visible:outline-none"
        }`}
        style={{
          borderColor: getBorderColor(),
          backgroundColor: getBackgroundColor(),
        }}
      >
        <span
          className={`${compact ? "w-7 h-7 text-xs" : "w-8 h-8 text-sm"} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}
          style={badgeStyles}
        >
          {option.id}
        </span>
        <span className={`flex-1 text-slate-gray ${compact ? "text-sm" : ""}`}>{option.text}</span>

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
          className="absolute right-0 top-full mt-1 z-20 w-64 max-w-[90vw] p-3 rounded-xl border border-border-default bg-surface shadow-lg"
        >
          <p className="text-xs font-semibold text-muted-foreground mb-1">
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
