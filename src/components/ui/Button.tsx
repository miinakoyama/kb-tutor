import type { ButtonHTMLAttributes } from "react";
import { buttonOutlinePrimary } from "@/lib/ui/status-badge-styles";

export type ButtonVariant = "primary" | "outline" | "icon";

export const buttonPrimaryClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const buttonOutlineClass = buttonOutlinePrimary;

export const buttonIconClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-gray/60 transition-colors hover:bg-surface-muted hover:text-slate-gray disabled:opacity-50 disabled:cursor-not-allowed";

export function buttonClassNames(variant: ButtonVariant = "primary"): string {
  if (variant === "outline") return buttonOutlineClass;
  if (variant === "icon") return buttonIconClass;
  return buttonPrimaryClass;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * Shared button used across teacher-dashboard surfaces. For a `<Link>` that
 * needs the same visual styling, use `buttonClassNames(variant)` directly.
 */
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const classes = className
    ? `${buttonClassNames(variant)} ${className}`
    : buttonClassNames(variant);
  return <button type={type} className={classes} {...props} />;
}
