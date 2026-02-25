"use client";

import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";

const PRIMARY_COLOR = "#16a34a";
const PRIMARY_LIGHT = "rgba(22, 163, 74, 0.1)";
const PENDING_COLOR = "#14532d";
const PENDING_LIGHT = "rgba(20, 83, 45, 0.1)";

interface OptionButtonProps {
  option: { id: string; text: string; feedback?: string };
  isSelected: boolean;
  showCorrect: boolean;
  showWrong: boolean;
  isAnswered: boolean;
  onSelect: (optionId: string) => void;
  showFeedbackIcon?: boolean;
  pendingSelection?: boolean;
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
}: OptionButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  const shouldShowIcon =
    showFeedbackIcon && isAnswered && !showCorrect && !isSelected && option.feedback;

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
    if (showCorrect) return PRIMARY_COLOR;
    if (showWrong) return "#f87171";
    if (isSelected && pendingSelection) return PENDING_COLOR;
    if (isSelected) return PRIMARY_COLOR;
    return "rgba(31, 45, 31, 0.2)";
  };

  const getBackgroundColor = () => {
    if (showCorrect) return PRIMARY_LIGHT;
    if (showWrong) return "rgba(248, 113, 113, 0.1)";
    if (isSelected && pendingSelection) return PENDING_LIGHT;
    if (isSelected) return PRIMARY_LIGHT;
    return "white";
  };

  const getBadgeStyles = () => {
    if (showCorrect || showWrong || isSelected) {
      let bgColor = PRIMARY_COLOR;
      if (showCorrect) bgColor = PRIMARY_COLOR;
      else if (showWrong) bgColor = "#f87171";
      else if (isSelected && pendingSelection) bgColor = PENDING_COLOR;
      
      return {
        backgroundColor: bgColor,
        color: "white",
      };
    }
    return {
      backgroundColor: "rgba(31, 45, 31, 0.1)",
      color: "#1f2d1f",
    };
  };

  const badgeStyles = getBadgeStyles();

  const isDisabled = isAnswered && !pendingSelection;

  return (
    <div className="relative">
      <button
        onClick={() => onSelect(option.id)}
        disabled={isDisabled}
        className={`group w-full text-left px-4 py-3 min-h-[48px] rounded-xl border-2 transition-all duration-200 break-words flex items-center gap-3 ${
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
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
          style={badgeStyles}
        >
          {option.id}
        </span>
        <span className="flex-1 text-slate-gray">{option.text}</span>

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
            onMouseLeave={() => setShowTooltip(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                setShowTooltip(!showTooltip);
              }
            }}
            className="flex-shrink-0 p-1 rounded-full text-slate-gray/40 hover:text-slate-gray/70 hover:bg-slate-gray/10 transition-colors cursor-pointer"
            aria-label="Why this option is incorrect"
          >
            <Info className="w-4 h-4" />
          </span>
        )}
      </button>

      {shouldShowIcon && showTooltip && (
        <div
          ref={tooltipRef}
          className="absolute right-0 top-full mt-1 z-20 w-64 p-3 rounded-xl border border-slate-gray/20 bg-white shadow-lg"
        >
          <p className="text-xs font-semibold text-slate-gray/60 mb-1">
            Why this is incorrect
          </p>
          <p className="text-sm text-slate-gray leading-relaxed">
            {option.feedback?.replace(/^(Correct\.|Incorrect\.)\s*/i, "").trim()}
          </p>
        </div>
      )}
    </div>
  );
}
