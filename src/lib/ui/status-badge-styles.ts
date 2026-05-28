/** Status badge / tone classes shared across teacher surfaces (light + dark). */

export const badgeEmerald =
  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-200/90 dark:border-emerald-800/35";

export const badgeAmber =
  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/45 dark:text-amber-200/90 dark:border-amber-800/35";

export const badgeRose =
  "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/45 dark:text-rose-200/90 dark:border-rose-800/35";

export const badgeNeutral =
  "bg-surface-muted text-muted-foreground border-border-default";

export const badgeViolet =
  "border-violet-200 bg-violet-50 text-violet-800 dark:bg-violet-950/45 dark:text-violet-200/90 dark:border-violet-800/35";

export const textEmerald = "text-emerald-700 dark:text-emerald-300";
export const textAmber = "text-amber-700 dark:text-amber-300";
export const textRose = "text-rose-700 dark:text-rose-300";

export const barEmerald = "bg-emerald-500 dark:bg-emerald-600/80";
export const barAmber = "bg-amber-500 dark:bg-amber-600/80";
export const barRose = "bg-rose-500 dark:bg-rose-600/80";

export const chipInactiveSlate =
  "border-border-default text-muted-foreground bg-surface hover:bg-surface-muted";

export const chipInactiveEmerald =
  "border-emerald-200 text-emerald-700 bg-surface hover:bg-emerald-50 dark:border-emerald-800/35 dark:text-emerald-300 dark:bg-surface-muted dark:hover:bg-emerald-950/30";

export const chipInactiveAmber =
  "border-amber-200 text-amber-700 bg-surface hover:bg-amber-50 dark:border-amber-800/35 dark:text-amber-300 dark:bg-surface-muted dark:hover:bg-amber-950/30";

export const chipInactiveRose =
  "border-rose-200 text-rose-700 bg-surface hover:bg-rose-50 dark:border-rose-800/35 dark:text-rose-300 dark:bg-surface-muted dark:hover:bg-rose-950/30";

export const chipActiveSlate =
  "bg-foreground text-background border-foreground dark:bg-foreground/90 dark:text-background";

export const chipActiveEmerald =
  "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-800/75 dark:border-emerald-700/50 dark:text-emerald-50";

export const chipActiveAmber =
  "bg-amber-500 text-white border-amber-500 dark:bg-amber-800/75 dark:border-amber-700/50 dark:text-amber-50";

export const chipActiveRose =
  "bg-rose-600 text-white border-rose-600 dark:bg-rose-900/75 dark:border-rose-800/50 dark:text-rose-100";

export function accuracyTextClass(value: number, hasAttempts: boolean): string {
  if (!hasAttempts) return "text-muted-foreground";
  if (value >= 70) return textEmerald;
  if (value >= 55) return textAmber;
  return textRose;
}

export function accuracyTextClassLenient(value: number, hasAttempts: boolean): string {
  if (!hasAttempts) return "text-muted-foreground";
  if (value >= 70) return textEmerald;
  if (value >= 50) return textAmber;
  return textRose;
}

/** Callout panels (Question Manager, bookmarks, practice hints). */
export const calloutPrimary =
  "rounded-lg border border-primary/25 bg-primary-light p-3 dark:border-primary-border dark:bg-primary-light";

export const calloutPrimaryTitle =
  "text-xs font-semibold text-forest mb-1";

export const calloutPrimaryTitleUpper =
  "text-xs font-semibold text-forest uppercase tracking-wide mb-1";

export const calloutPrimaryBody = "text-sm text-slate-gray";

/** Secondary info callout (explanations) — muted sky, safe in dark mode. */
export const calloutInfo =
  "rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-800/35 dark:bg-sky-950/40";

export const calloutInfoTitleUpper =
  "text-xs font-semibold text-sky-800 dark:text-sky-200/90 uppercase tracking-wide mb-1";

export const calloutInfoIcon = "text-sky-600 dark:text-sky-300";

export const calloutAmber =
  "rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/35 dark:bg-amber-950/40";

export const calloutAmberTitleUpper =
  "text-xs font-semibold text-amber-800 dark:text-amber-200/90 uppercase tracking-wide mb-1";

export const calloutAmberIcon = "text-amber-600 dark:text-amber-400";

export const alertSuccess =
  "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800/35 dark:bg-emerald-950/40 dark:text-emerald-200/90";

export const alertAmber =
  "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/35 dark:bg-amber-950/40 dark:text-amber-200/90";

export const buttonOutlinePrimary =
  "inline-flex items-center gap-2 rounded-lg border border-primary/50 px-4 py-2 text-sm font-medium text-forest hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const optionPanelCorrect =
  "p-3 rounded-lg text-sm bg-primary-light border border-primary/25";

export const optionPanelNeutral =
  "p-3 rounded-lg text-sm bg-surface-muted border border-border-subtle";

/** Summary stat / metric cards on teacher assignment pages. */
export const statCardBase =
  "rounded-lg border border-border-default bg-surface px-4 py-3";

export const statCardHighlight =
  "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/35 dark:bg-amber-950/40";

export const metricCardNeutral = "border-border-default bg-surface";
export const metricCardGood = "border-primary/30 bg-primary-light";
export const metricCardWarn =
  "border-amber-200 bg-amber-50 dark:border-amber-800/35 dark:bg-amber-950/40";
