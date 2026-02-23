"use client";

const PRIMARY_COLOR = "#16a34a";
const PRIMARY_LIGHT = "rgba(22, 163, 74, 0.1)";

interface OptionButtonProps {
  option: { id: string; text: string; feedback?: string };
  isSelected: boolean;
  showCorrect: boolean;
  showWrong: boolean;
  isAnswered: boolean;
  onSelect: (optionId: string) => void;
}

export function OptionButton({
  option,
  isSelected,
  showCorrect,
  showWrong,
  isAnswered,
  onSelect,
}: OptionButtonProps) {
  const getBorderColor = () => {
    if (showCorrect) return PRIMARY_COLOR;
    if (showWrong) return "#f87171";
    if (isSelected) return PRIMARY_COLOR;
    return "rgba(31, 45, 31, 0.2)";
  };

  const getBackgroundColor = () => {
    if (showCorrect) return PRIMARY_LIGHT;
    if (showWrong) return "rgba(248, 113, 113, 0.1)";
    if (isSelected) return PRIMARY_LIGHT;
    return "white";
  };

  const getBadgeStyles = () => {
    if (showCorrect || showWrong || isSelected) {
      return {
        backgroundColor: showCorrect
          ? PRIMARY_COLOR
          : showWrong
            ? "#f87171"
            : PRIMARY_COLOR,
        color: "white",
      };
    }
    return {
      backgroundColor: "rgba(31, 45, 31, 0.1)",
      color: "#1f2d1f",
    };
  };

  const badgeStyles = getBadgeStyles();

  return (
    <button
      onClick={() => onSelect(option.id)}
      disabled={isAnswered}
      className={`group w-full text-left px-4 py-3 min-h-[48px] rounded-xl border-2 transition-all duration-200 break-words flex items-center gap-3 ${
        isAnswered
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
      <span className="text-slate-gray">{option.text}</span>
    </button>
  );
}
