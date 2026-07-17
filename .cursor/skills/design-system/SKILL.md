---
name: "design-system"
description: "Design token system extracted from the My Assignments page (student /assignments route) and its component tree, extended with the teacher-dashboard admin-UI patterns (§10). Use as the reference palette/type/spacing system when building new pages so they visually match My Assignments, or the admin patterns when building dense dashboard/admin surfaces."
metadata:
  source: "src/app/assignments/page.tsx and its full render tree, src/app/globals.css, src/components/Sidebar.tsx, src/app/layout.tsx"
  extracted: "2026-07-11"
  extended: "2026-07-14 — added §10 Teacher Dashboard Extensions (Admin UI) after a compliance audit of src/app/teacher-dashboard/**, src/components/PerformanceThresholdsCard.tsx, src/components/short-answer/FeedbackReportsSection.tsx + FeedbackSettingsCard.tsx, src/lib/analytics/band-display.ts, src/components/ui/Button.tsx, src/lib/ui/status-badge-styles.ts"
---

# My Assignments — Design Token System

Extracted **only** from what actually renders on the student `/assignments`
page: `StudentAssignmentsPageClient` → `StudentAssignmentsList` →
`NextStepCard`, `AssignmentRow`, `CompletedSection` (+`KebabMenu`),
`ThisWeekSidebar` (+`WeeklyItem`), `InstructorNoteIndicator`,
`assignment-design.ts`, plus the app chrome that wraps every page
(`Sidebar.tsx`, `AppChrome.tsx`, `layout.tsx`, `globals.css`).

Styles from other pages (e.g. `AssignmentModeBadge.tsx`, used only on the
Home page) are **excluded** — see the ⚠️ inconsistency notes where a
same-semantic value diverges between components *within* this page.

This project uses Tailwind v4 (`@import "tailwindcss"` + `@theme inline` in
`globals.css`) — there is **no `tailwind.config.js`**. All CSS variables
below live in `src/app/globals.css` (`:root` / `.dark` blocks). Component
code overwhelmingly uses inline `style={{ ... }}` with `var(--token)`
rather than Tailwind utility classes for anything token-driven; Tailwind
classes are used for layout/flex/plain-Tailwind-scale spacing.

---

## 1. Color Tokens

### Brand / Primary

| Token | Value (light) | Value (dark) | Used in |
|---|---|---|---|
| `--sidebar-gradient` | `#0c6b45` | `#0c6b45` (same) | `Sidebar.tsx` aside/header/mobile-drawer background (flat color, despite the variable name — no gradient is applied anywhere it's used) |
| `--primary` | `#16a34a` | `#3d9a62` | Not directly used inside the assignments component tree itself (search input has a `focus:ring-primary/40` Tailwind utility) |
| `--primary-hover` | `#15803d` | `#348554` | Not in the original assignments-page extraction; used by the teacher-dashboard admin Button's `primary` variant (§10) |
| `--primary-light` | `rgba(22, 163, 74, 0.1)` | `rgba(61, 154, 98, 0.14)` | Not in the original assignments-page extraction; used by the teacher-dashboard admin Button's `outline` variant hover state (§10) |
| `--assignment-cta-bg-strong` | `rgb(12 107 69 / 0.9)` | *(not overridden in `.dark` — falls back to light value)* | Hero card primary CTA (`NextStepCard` "Continue"/"Start" button) |
| `--assignment-cta-bg` | `rgb(12 107 69 / 0.7)` | *(not overridden — ⚠️ see below)* | Declared but **not referenced by any component** on this page — dead token |
| `--assignment-cta-bg-hover` / `-active` | `rgb(12 107 69 / 0.76)` / `0.64` | *(not overridden)* | Declared but not referenced by any component on this page (hero CTA uses `hover:brightness-110` instead) — dead tokens |
| Active nav item bg | `bg-surface/20` (Tailwind opacity util on `--surface`) | same | `Sidebar.tsx` active `<Link>` |

⚠️ **Inconsistency**: `--assignment-cta-bg`, `--assignment-cta-bg-hover`, `--assignment-cta-bg-strong`, `--assignment-cta-bg-active`, `--assignment-cta-shadow`, `--assignment-cta-elevated-shadow`, `--assignment-cta-text`, `--assignment-on-accent` are all defined in `:root` but **have no `.dark` override** — in dark mode the hero CTA button keeps its light-mode green/cream colors. Not found to be a problem in the other `--assignment-*` groups (those all have dark overrides).

### Semantic

| Token | Light | Dark | Used in |
|---|---|---|---|
| `--assignment-due` | `#c24f44` | `#fca5a5` | Overdue date text/icon (`assignment-overdue` aliases this) |
| `--assignment-due-muted` | `rgb(194 79 68 / 0.5)` | `rgb(252 165 165 / 0.5)` | `ThisWeekSidebar` agenda left color-bar (todo items), calendar "due" dot legend uses the **non-muted** `--assignment-due` instead (see ⚠️ below) |
| `--assignment-overdue` | `= --assignment-due` | `= --assignment-due` | `isAssignmentOverdue()` styling in `NextStepCard`/`AssignmentRow` (date text + calendar icon color) |
| `--assignment-completed` | `= --sidebar-gradient` (`#0c6b45`) | *(not overridden; resolves via `--sidebar-gradient` which is redefined identically in `.dark`, so effectively same in both themes)* | "All assignments complete" check icon, calendar "today" circle fill, calendar "completed" dot |
| `--assignment-completed-muted` | `rgb(12 107 69 / 0.5)` | `rgb(61 154 98 / 0.5)` | `ThisWeekSidebar` agenda left color-bar (done items) + strikethrough decoration color |
| Practice tag | text `#3a5c96` / bg `#edf2fa` (light); text `#a9c3f0` / bg `rgba(58,92,150,0.28)` (dark) | — | `--assignment-mode-practice` / `-bg` |
| Exam tag | text `#a85179` / bg `#faedf3` (light); text `#e0a2bf` / bg `rgba(168,81,121,0.26)` (dark) | — | `--assignment-mode-exam` / `-bg` |
| Review tag | text `#8a6216` / bg `#fbf2dc` (light); text `#f0cf86` / bg `rgba(251,242,220,0.16)` (dark) | — | `--assignment-mode-review` / `-bg` |
| Error/danger (global, not assignment-scoped) | `#f87171` / bg `rgba(248,113,113,0.1)` | `#fca5a5` / `rgba(248,113,113,0.15)` | `--error-color` / `--error-light` — used only in the page's load-error banner (`bg-error-light`, `text-error`, `border-error-border`) |

⚠️ **Inconsistency**: tag `pillBorder` is always set equal to `pillBg` (`assignment-design.ts`: `pillBorder: "var(--assignment-mode-practice-bg)"`, etc.) — i.e. the 1.5px pill border is literally the same color as its own fill. This looks intentional (a soft/invisible border used only for consistent sizing against `--assignment-pill-highlight`'s inset light), but it means there is no separate "pill border" token — don't invent one.

⚠️ **Inconsistency**: the calendar "Due" legend dot and per-day due dot both use `--assignment-due` (full-strength), while the agenda list's left color-bar for the same "due/todo" semantic uses `--assignment-due-muted` (50% alpha). Two different strengths of the same semantic color, not unified.

### Neutral

| Token | Light | Dark | Used in |
|---|---|---|---|
| `--background` | `#f8f8f8` | `#0c140e` | Page background (`body`, `AppChrome` wrapper `bg-background`) |
| `--surface` | `#ffffff` | `#152018` | `--color-surface` Tailwind token; `bg-surface` class on the search input and "no results" banner (both are then visually overridden by inline `--assignment-*` background — see Anti-patterns) |
| `--surface-muted` | `#f8faf8` | `#1a2820` | Progress bar track background (`NextStepCard`) |
| `--foreground` | `#1f2d1f` | `#e8f0ea` | Primary text (`--color-slate-gray` aliases this; used as `text-slate-gray` class and inline `color: var(--foreground)`) |
| `--muted-foreground` | `rgba(31,45,31,0.7)` | `rgba(232,240,234,0.68)` | Secondary/meta text throughout (dates, question counts, attempts, empty states, section labels) |
| `--heading` | `#14532d` | `#c5d9cc` | `text-heading` class is applied to the `NextStepCard` `<h2>` title but is **dead** — an inline `color: "var(--foreground)"` on the same element overrides it. `--heading` is not visibly used anywhere on this page. |
| `--border-default` | `rgba(31,45,31,0.2)` | `rgba(232,240,234,0.16)` | `NextStepCard` divider, progress bar track border |
| `--border-subtle` | `rgba(31,45,31,0.1)` | `rgba(232,240,234,0.08)` | Right-rail column divider in `StudentAssignmentsList` |
| `--assignment-glass-border` | `rgba(255,255,255,0.9)` | `rgba(232,240,234,0.12)` | Card border on `NextStepCard`, `AssignmentRow`, `CompletedRow`, CTA button border |
| `--assignment-panel-border` | `rgb(12 107 69 / 0.08)` | `rgba(143,191,159,0.14)` | `ThisWeekSidebar` calendar panel border, `WeeklyItem` agenda card border |

### Special

| Token | Value | Used in |
|---|---|---|
| Calendar "due" dot | `var(--assignment-due)` (`#c24f44` / `#fca5a5`) | `ThisWeekSidebar` per-day dot + legend |
| Calendar "completed" dot | `var(--assignment-completed)` (`#0c6b45`, both themes) | `ThisWeekSidebar` per-day dot + legend |
| Agenda left color-bar — todo | `var(--assignment-due-muted)` | `WeeklyItem` (kind="todo") |
| Agenda left color-bar — done | `var(--assignment-completed-muted)` | `WeeklyItem` (kind="done") |
| Progress bar track | `var(--surface-muted)` fill, `var(--border-default)` 1.5px border | `NextStepCard` |
| Progress bar fill | `var(--assignment-progress-fill)` = `#7fb89d` (same value in both themes) | `NextStepCard` |
| Progress marker (mascot) drop-shadow | `var(--assignment-progress-marker-shadow)` — `drop-shadow(0 4px 8px rgb(70 120 156 / 0.22))` light, `drop-shadow(0 4px 8px rgb(0 0 0 / 0.3))` dark | `/illustrations/Progress 1.png` marker image |
| Strikethrough (completed weekly item) | `text-decoration-color` = `var(--assignment-completed-muted)`, thickness `2.5px` | `WeeklyItem` (kind="done") title |

---

## 2. Typography Tokens

**Font families** (defined in `layout.tsx` via `next/font/google` + `globals.css` `@theme inline`):

```
--font-geist  → Geist (Google Font), var(--font-geist)   — used as "font-heading" / most headings & titles
--font-inter  → Inter (Google Font), var(--font-inter)   — --font-sans, the body default
```

Fallback stack used everywhere in code: `ui-sans-serif, sans-serif` (or, for the true body default, `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`).

⚠️ **Inconsistency**: the *same semantic element* uses a different font-family depending on which component renders it:

| Element | In `NextStepCard` (hero) | In `AssignmentRow` / `CompletedSection` (rows) |
|---|---|---|
| Mode tag/pill text | `var(--font-inter)` | `var(--font-geist)` |
| Question-count / meta text | `var(--font-inter)` | `var(--font-geist)` |
| Due-date text | `var(--font-inter)` | `var(--font-geist)` |
| CTA button label | *(none set — inherits body `font-sans` = Inter)* | `var(--font-geist)` (explicit) |

Titles are consistent (`var(--font-geist)`) in both. Only the *metadata-tier* text diverges.

### Type scale (as rendered on this page)

| Semantic name | Size | Weight | Line-height | Letter-spacing | Transform | Color token | Font | Where |
|---|---|---|---|---|---|---|---|---|
| Section label ("UP NEXT", "ALL ASSIGNMENTS") | 14px | 500 (`font-medium`) | default | `tracking-wide` (Tailwind, ~0.025em) | uppercase | `--muted-foreground` | inherited (Inter) | `StudentAssignmentsList` |
| Section label — collapsible variant ("Completed (N)") | 14px | 500 | default | `0.4px` (inline) | uppercase | `--muted-foreground` | inherited (Inter) | `CompletedSection` toggle button |
| Hero title | 26px | 700 | 1.25 | -0.4px | none | `--foreground` | Geist | `NextStepCard` `<h2>` |
| Row/Completed card title | 18px | 600 | 1.4 | -0.4px | none | `--foreground` (`text-slate-gray`) | Geist | `AssignmentRow`, `CompletedRow` |
| Mode tag/pill | 15px (hero) / 13px (row) | 500 | 1.5 | -0.1px | none | mode color token | Inter (hero) / Geist (row) ⚠️ | pills across all 3 cards |
| Body/meta (questions, attempts) | 15px | 400 | 1.5 | -0.1px | none | `--muted-foreground` | Inter (hero) / Geist (row) ⚠️ | progress %, "N questions", attempts text |
| Date text — normal | 15px | 400 | 1.5 | -0.1px | none | `--muted-foreground` | Inter (hero) / Geist (row) ⚠️ | due date |
| Date text — overdue | 15px | 400 | 1.5 | -0.1px | none | `--assignment-overdue` | same as above | due date when `isAssignmentOverdue()` |
| Instructor note (collapsed quote) | 13px | 400, italic | 1.45 | none | none | `--muted-foreground` | Inter | `NextStepCard` note toggle |
| Instructor note tooltip label | 15px | 500 | 1.4 | 0.08em | uppercase | `--muted-foreground` | Geist | `InstructorNoteIndicator` "INSTRUCTOR NOTE" |
| Instructor note tooltip body | 15px | 500 | 1.4 | none | none | `--foreground` | Geist | `InstructorNoteIndicator` note text |
| Button/CTA label | 16px | 700 (`font-bold`) | default (hero) / 1.5 (row) | 0.3px + `wordSpacing: 1px` | none | `--assignment-cta-text` / `--assignment-row-cta-text` | inherited-Inter (hero) / Geist (row) ⚠️ | Start/Continue buttons |
| Kebab menu item ("Review"/"Retry") | 15px | 500 | 1.4 | none | none | `--foreground` (`text-slate-gray`) | Geist | `KebabMenu` |
| Kebab menu caption ("Maximum retries reached.") | 12px | 400 | 1.4 | none | none | `--muted-foreground` | Inter | `KebabMenu` |
| Calendar month heading | 19px | 600 | 1.2 | none | none | `--foreground` (`text-slate-gray`) | Geist | `ThisWeekSidebar` |
| Calendar weekday label (Sun/Mon…) | 12px | 400 | default | none | none | `--muted-foreground` | Inter | `ThisWeekSidebar` grid header |
| Calendar day number | 12px | 600 if today else 400 | 1 | none | none | `--foreground` / `--assignment-on-accent` (today) | Inter | `ThisWeekSidebar` day cell |
| Calendar legend ("Due"/"Completed") | 12px | default | default | none | none | `--muted-foreground` | Inter | `ThisWeekSidebar` |
| Week title ("This Week"/"Next Week") | 12px | 500 | default | `tracking-wide` | uppercase | `--muted-foreground` | inherited (Inter) | `ThisWeekSidebar` |
| Week range ("Jul 6 - Jul 12") | 11px (if title shown) / 14px (if not) | default | 1.35 | none | none | `--muted-foreground` | inherited (Inter) | `ThisWeekSidebar` |
| Agenda item title | 15px | 600 | 1.4 | none | none | `--foreground` (`text-slate-gray`) | Geist | `WeeklyItem` |
| Agenda item date/meta | 12px | default | 1.45 | none | none | `--muted-foreground` | inherited (Inter) | `WeeklyItem` |
| Nav item label (sidebar) | 16px (`text-base`) | 500 (`font-medium`) | default | none | none | white / white-90% | inherited (Inter) | `Sidebar.tsx` |
| Nav section title (sidebar) | 12px (`text-xs`) | 600 (`font-semibold`) | default | `tracking-wider` | uppercase | white 50% | inherited (Inter) | `Sidebar.tsx` |

---

## 3. Spacing Tokens

**No formal spacing scale/CSS variables exist** — spacing is a mix of Tailwind's default 4px-based utility scale (`gap-3`, `p-5`, `px-4`, etc.) and inline arbitrary pixel values. Most inline values are still multiples of 4 (12, 16, 20, 24, 28, 40), with occasional 2px half-steps (6, 10, 14). Treat "4px" as the *de facto* base unit; it is not enforced anywhere.

### Layout-level

| Region | Value | Source |
|---|---|---|
| Sidebar width (expanded) | `256px` (`lg:w-64`) | `Sidebar.tsx` |
| Sidebar width (collapsed) | `56px` (`lg:w-14`) | `Sidebar.tsx` |
| Main content left offset | `pl-64` / `pl-14` (matches sidebar width), `pt-16` on mobile | `AppChrome.tsx` |
| Main content max-width | `1500px` | `StudentAssignmentsList` `<main>` inline `maxWidth` |
| Content inner width (below max-width) | `96%` (`xl:w-[96%]`) on section wrappers | `StudentAssignmentsList` |
| 3-column grid (main / divider / right-rail) | `xl:grid-cols-[minmax(0,1fr)_1px_minmax(300px,360px)]` | `StudentAssignmentsList` |
| Right rail sticky offset | `xl:top-8` (32px) | `StudentAssignmentsList` |
| Section vertical gap | `space-y-10` (40px) | `StudentAssignmentsList` main column |
| Page horizontal padding | `px-4 sm:px-6 lg:px-10 xl:px-12` (16 / 24 / 40 / 48px) | `StudentAssignmentsList` `<main>` |
| Page top/bottom padding | `pt-6 sm:pt-8` / `pb-16` (24/32px top, 64px bottom) | `StudentAssignmentsList` `<main>` |

### Component-level

| Element | Value | Source |
|---|---|---|
| Hero card padding | `p-5 sm:p-6 md:px-7` (20 / 24 / 28px) | `NextStepCard` |
| Row/Completed card padding | `px-4 sm:px-6`, `paddingTop/Bottom: 16px`, `minHeight: 104px` | `AssignmentRow`, `CompletedRow` |
| Card-to-card vertical gap | `gap-3` (12px, `flex flex-col gap-3`) | active list, completed list |
| Row internal gap (icon / title / date / cta) | `gap-4 sm:gap-6` (16 / 24px) | `AssignmentRow`, `CompletedRow` |
| Title-row icon-to-text gap | `gap-1.5` (6px) | title + instructor-note-icon |
| Tag-row gap | `gap-3` (12px, `mt-2 flex flex-wrap items-center gap-3`) | tag + question-count row |
| Tag/pill padding | `px-3 py-1` (12px / 4px) | mode pills |
| Button height | `46px` fixed, full width in its column | all CTA buttons |
| Search bar height | `38px`, `paddingLeft: 36px`, `paddingRight: 14px` | `StudentAssignmentsList` |
| Due-date column width | `196px` fixed (row cards) | `AssignmentRow`, `CompletedRow` |
| Calendar day cell min-height | `22px` (aspect-square) | `ThisWeekSidebar` |
| Calendar panel inner width | `90%`, centered (`marginLeft/Right: auto`) | `ThisWeekSidebar` |
| Agenda card min-height | `68px`, `paddingTop/Bottom: 14px` | `WeeklyItem` |
| Nav item padding (expanded) | `px-3.5 py-3` (14 / 12px) | `Sidebar.tsx` |
| Nav item padding (collapsed) | `p-3` (12px) | `Sidebar.tsx` |
| Nav item stacking gap | `space-y-[5px]` | `Sidebar.tsx` nav section |

---

## 4. Radius Tokens

**No global radius scale/CSS variables** — every radius is a literal Tailwind class or inline px value, chosen per component. Two "families" emerge:

| Radius | Value | Full-round? | Used in |
|---|---|---|---|
| Hero card | `28px` mobile / `32px` sm+ (`rounded-[28px] sm:rounded-[32px]`) | no | `NextStepCard` outer `<article>` |
| Row/Completed card | `16px` (`rounded-2xl`) | no | `AssignmentRow`, `CompletedRow`, "view all" banners, `WeeklyItem` |
| Calendar panel | `26px` (`rounded-[26px]`) | no | `ThisWeekSidebar` outer panel |
| Popover/menu (kebab, instructor-note tooltip) | `16px` (kebab menu) / `8px` (tooltip) | no | `CompletedSection` `KebabMenu`, `InstructorNoteIndicator` |
| Nav item (sidebar) | `8px` (`rounded-lg`) | no | `Sidebar.tsx` |
| User menu popup (sidebar) | `12px` (`rounded-xl`) | no | `Sidebar.tsx` |
| Buttons (CTA) | `999px` inline override | **yes** | all Start/Continue/Retry buttons — note the `rounded-xl` Tailwind class is also present on these elements but is dead, overridden by the inline `borderRadius: 999` |
| Search bar | `999px` | yes | `StudentAssignmentsList` search input |
| Tag/pill | `rounded-full` (Tailwind, resolves to 9999px) | yes | mode tags |
| Progress bar (track + fill) | `rounded-full` | yes | `NextStepCard` |
| Calendar "today" circle | `14px` on a 22×22px box | yes (radius exceeds half the box, renders as a circle) | `ThisWeekSidebar` day cell |
| Avatar (sidebar) | `rounded-full` | yes | `Sidebar.tsx` user avatar |

⚠️ Two different radii (16px and 26/28/32px) are both used for "elevated card" style elements with no documented rule for which to use where; treat 16px as the *row-level* radius and 28–32px as the *hero-level* radius, and don't introduce a third value.

---

## 5. Shadow Tokens

All shadow values are CSS custom properties in the `--assignment-*` namespace (full light+dark pairs), except for the plain Tailwind shadow utilities used in `Sidebar.tsx`.

```css
--assignment-card-shadow:            /* row/completed cards */
  inset 0 1px 0 rgb(255 255 255 / 0.96), 0 0 0 1px rgb(226 232 240 / 0.32),
  0 10px 24px rgb(31 45 31 / 0.05), 0 2px 6px rgb(31 45 31 / 0.03);      /* light */
  inset 0 1px 0 rgb(255 255 255 / 0.07), 0 0 0 1px rgb(232 240 234 / 0.08),
  0 12px 28px rgb(0 0 0 / 0.22), 0 2px 8px rgb(0 0 0 / 0.2);            /* dark */

--assignment-elevated-shadow:        /* hero card, "all complete" banner */
  0 8px 40px rgb(226 230 223 / 0.36), 0 2px 16px rgb(204 210 201 / 0.24); /* light */
  0 16px 42px rgb(0 0 0 / 0.28), 0 2px 12px rgb(0 0 0 / 0.22);           /* dark */

--assignment-search-shadow:          /* search input */
  inset 0 1px 0 rgb(255 255 255 / 0.82), 0 0 0 1px rgb(218 232 223 / 0.1),
  0 8px 20px rgb(24 72 46 / 0.03);                                       /* light */
  inset 0 1px 0 rgb(255 255 255 / 0.07), 0 8px 20px rgb(0 0 0 / 0.22);   /* dark */

--assignment-pill-highlight:         /* inset sheen on pills + progress track */
  inset 0 1px 2px rgb(255 255 255 / 0.8);                                /* light */
  inset 0 1px 1px rgb(255 255 255 / 0.08);                               /* dark */

--assignment-cta-shadow:             /* declared; not referenced by any component on this page */
  inset 0 1px 1px rgb(255 255 255 / 0.18), inset 0 -1px 1px rgb(255 255 255 / 0.08);

--assignment-cta-elevated-shadow:    /* hero "Continue"/"Start" button */
  inset 0 1px 2px rgb(255 255 255 / 0.2), 0 4px 10px rgb(7 66 42 / 0.18); /* light only, no dark override */

--assignment-row-cta-shadow:         /* row/completed CTA buttons */
  0 4px 10px rgb(38 37 31 / 0.08);                                       /* light */
  0 4px 10px rgb(0 0 0 / 0.16);                                          /* dark */

--assignment-nav-shadow:             /* calendar/week prev-next nav buttons */
  0 4px 10px rgb(12 107 69 / 0.14);                                      /* light */
  0 4px 10px rgb(0 0 0 / 0.28);                                          /* dark */

--assignment-popover-shadow:         /* kebab menu + instructor-note tooltip */
  0 8px 18px rgba(38, 37, 31, 0.14);                                     /* light */
  0 10px 24px rgb(0 0 0 / 0.32);                                         /* dark */

--assignment-progress-marker-shadow: /* CSS filter, not box-shadow */
  drop-shadow(0 4px 8px rgb(70 120 156 / 0.22));                         /* light */
  drop-shadow(0 4px 8px rgb(0 0 0 / 0.3));                               /* dark */
```

Sidebar (plain Tailwind, not tokenized): `shadow-xl` (desktop aside, mobile drawer, user-menu popup), `shadow-inner` (active nav item), `shadow-sm` (mobile top header bar).

---

## 6. Border Tokens

| Width | Where | Color token |
|---|---|---|
| `1px` | Card outlines (`NextStepCard`, `AssignmentRow`, `CompletedRow`), kebab menu, instructor tooltip, calendar panel, agenda card, right-rail column divider | `--assignment-glass-border` / `--assignment-panel-border` / `--assignment-popover-border` / `--border-subtle` |
| `1.5px` | Mode pills, CTA buttons, progress bar track | `--assignment-mode-*-bg` (self-referential), `--assignment-glass-border`, `--border-default` |
| `1px` | Sidebar section dividers, sidebar user-menu border | `border-white/10` (Tailwind opacity util), `--border-subtle` |
| none (shadow-only) | Search bar (border **and** shadow both present, so not shadow-only), progress marker, calendar day cells | — |

No component on this page relies purely on shadow with zero border — every card/pill/button that has a shadow also carries a matching hairline border.

---

## 7. Icon Tokens

**Library**: `lucide-react`, default stroke width (2 — no component overrides `strokeWidth`).

### Assignment type → icon mapping (`assignment-design.ts`, `ASSIGNMENT_MODE_META`)

| Mode | Icon | Color token (light) |
|---|---|---|
| Practice | `NotebookPen` | `--assignment-mode-practice` (`#3a5c96`) |
| Exam | `GraduationCap` | `--assignment-mode-exam` (`#a85179`) |
| Review | `RotateCcw` | `--assignment-mode-review` (`#8a6216`) |

### All icons used on this page, with size

| Icon | Size | Where |
|---|---|---|
| `Calendar` | 14×14 | `NextStepCard` due-date row |
| `Calendar` | 13×13 | `AssignmentRow` due-date column |
| `MessageCircle` | 14×14 (`h-3.5 w-3.5`) | `NextStepCard` instructor-note toggle |
| `MessageCircle` | 16×16 (`h-4 w-4`) | `InstructorNoteIndicator` trigger button |
| `NotebookPen` / `GraduationCap` / `RotateCcw` | 24×24 | mode icon in `AssignmentRow` / `CompletedRow` |
| `ChevronDown` / `ChevronRight` | 14×14 (`w-3.5 h-3.5`) | `CompletedSection` collapse toggle |
| `MoreHorizontal` | 16×16 (`w-4 h-4`) | `CompletedRow` kebab trigger |
| `ChevronLeft` / `ChevronRight` | 16×16 (`h-4 w-4`) | `ThisWeekSidebar` month + week nav |
| `Search` | 15×15 | `StudentAssignmentsList` search input |
| `CheckCircle2` | 24×24 (`h-6 w-6`) | "All assignments complete" empty state |
| Nav icons (`Home`, `ClipboardList`, `NotebookPen`, `Bookmark`, `BarChart3`, etc.) | 20×20 (`w-5 h-5`) | `Sidebar.tsx` |
| `ChevronUp` (user menu caret) | 16×16 (`w-4 h-4`) | `Sidebar.tsx` |
| `FlaskConical` (logo) | 28×28 desktop / 20×20 mobile | `Sidebar.tsx` |

⚠️ No icon is used with a `fill` — all are stroke-only outline icons (lucide default). Keep new icons stroke-only to match.

---

## 8. Component Patterns

### Assignment card (two variants sharing one visual language)

**Hero (`NextStepCard`)** — structure: left panel (~72% width) = mode pill + due date row → title → optional instructor-note quote → progress bar + %; right panel (~28%) = questions/attempts text → primary CTA. Divider between panels: 1px `--border-default`.

**Row (`AssignmentRow` / `CompletedRow`)** — structure: mode icon (left, 24px) → flex-1 text block (title + note-icon, then tag + question-count row) → fixed 196px date/score column → fixed-width CTA button (or kebab menu for completed rows with history).

Token recipe (both): `--assignment-glass-bg[-strong]` background, `--assignment-glass-border` 1px border, `--assignment-card-shadow` / `--assignment-elevated-shadow`, backdrop blur `blur(14px) saturate(115%)` (row only — hero has no backdrop-filter).

States:
- **Not started** → CTA label "Start"
- **In progress** → CTA label "Continue"
- **Completed** → no CTA button; shows completion date + `Score: {accuracy}%` + kebab menu ("Review" always, "Retry" enabled/disabled by `attemptsCapped`)

### Button

| | Primary (hero CTA) | Secondary (row CTA) |
|---|---|---|
| Background | `--assignment-cta-bg-strong` | `--assignment-row-cta-bg` |
| Text | `--assignment-cta-text` (`#f0f7f3` light) | `--assignment-row-cta-text` (`#095536` light) |
| Border | `--assignment-glass-border`, 1.5px | `--assignment-row-cta-border`, 1.5px |
| Shadow | `--assignment-cta-elevated-shadow` | `--assignment-row-cta-shadow` |
| Hover | `hover:brightness-110` | `hover:bg-[var(--assignment-row-cta-bg-hover)]` |
| Radius | 999px (pill) | 999px (pill) |
| Height | 46px | 46px |

"Start" vs "Continue" is purely a label swap on the identical button style — `assignment.status === "in_progress" ? "Continue" : "Start"`. There is no visual differentiation (no icon, no shade change) between the two states, per the open question already resolved as "no" in the current implementation.

### Tag/Badge (mode pill)

| Mode | bg | text | border (= bg) |
|---|---|---|---|
| Practice | `--assignment-mode-practice-bg` | `--assignment-mode-practice` | same as bg |
| Exam | `--assignment-mode-exam-bg` | `--assignment-mode-exam` | same as bg |
| Review | `--assignment-mode-review-bg` | `--assignment-mode-review` | same as bg |

Padding `12px/4px`, `rounded-full`, `--assignment-pill-highlight` inset shadow, 1.5px border.

### Progress bar

Track: `--surface-muted` fill, `--border-default` 1.5px border, `rounded-full`, height 30px. Fill: `--assignment-progress-fill` (`#7fb89d`, same both themes), `rounded-full`, width = `completionRatio * 100%`, `transition: width 300ms ease-out`. Mascot marker: absolutely-positioned PNG (`/illustrations/Progress 1.png`), clamped between the track edges via `clamp()`, `transition: left 300ms ease-out`, drop-shadow via `--assignment-progress-marker-shadow`. This is the only animated/motion element found in the token extraction (see §9).

### Section header

Plain (`StudentAssignmentsList`): uppercase 14px label, no interactivity.
Collapsible (`CompletedSection`): same label style + leading `ChevronDown`/`ChevronRight` (14px) that flips on click; `aria-expanded` toggled; body only renders when open.

### Right rail

- **Calendar**: month grid, `--assignment-completed` filled circle marks "today", small 4×4px dots below each day number mark due (`--assignment-due`) / completed (`--assignment-completed`) counts (both dots can appear on the same day). Legend row repeats the same two dot colors with text labels "Due" / "Completed".
- **Agenda item (`WeeklyItem`)**: 4px-wide left color bar (`--assignment-due-muted` for todo, `--assignment-completed-muted` for done) + title + date/completion meta. Swiping left/right (touch) navigates ±1 week; chevron buttons do the same.
- **Done item rule**: title gets `text-decoration: line-through`, decoration color = `--assignment-completed-muted`, thickness `2.5px`. This is the single cross-component "completed" visual rule (see §8 state rules below) — it's implemented identically nowhere else on the page (row/hero cards use badge/date-removal instead of strikethrough).

### Sidebar

| State | Background | Text |
|---|---|---|
| Default | transparent | `text-white/90` |
| Hover | `hover:bg-surface/10` | `hover:text-white` |
| Active | `bg-surface/20` + `shadow-inner` | `text-white` |

Icon 20×20, label 16px/500. Section title (when present) 12px/600 uppercase `text-white/50`. Collapsed state hides labels via `max-width/opacity/translate` transition, not `display:none` (keeps icons keyboard/hover-accessible during the collapse animation).

### State expression rules (cross-component)

| State | Rule |
|---|---|
| Overdue | Date text + calendar icon switch from `--muted-foreground` to `--assignment-overdue` (= `--assignment-due`). This is the *only* overdue signal on the hero card (per the original spec doc, confirmed in code — no badge, no red background). |
| Completed (row-level) | Card shows completion date + score instead of progress bar/CTA; kebab menu replaces the CTA button. |
| Completed (agenda-level) | Strikethrough title, muted-green decoration/left-bar, "Completed {date}" caption instead of due date. |
| No retries left | Kebab menu "Retry" row rendered disabled/grayed (`line-through`, `text-muted-foreground`) with visible reason text "Maximum retries reached." + "Attempts used: X / Y" — never hidden, always shown with explanation (per spec: "visible, not hidden"). |

---

## 9. Interaction / Motion

No centralized motion/transition token system (no `--duration-*` or `--ease-*` CSS variables). Ad hoc values found in the assignments tree:

| Element | Transition |
|---|---|
| Progress bar fill width | `transition-all duration-300` (Tailwind) |
| Progress bar mascot marker `left` position | `transition: left 300ms ease-out` (inline) |
| CTA button hover | `transition duration-200`, `hover:brightness-110 active:brightness-95` (hero) / `hover:-translate-y-px active:translate-y-0` (row) |
| Generic color/bg transitions | Tailwind `transition-colors` (kebab menu items, "view all" links, chevron toggle) — no explicit duration override, uses Tailwind default (150ms) |

Sidebar (outside the assignments tree, but shared chrome) uses a more deliberate system worth reusing: `duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]` for width/background/padding changes, `duration-200` with the same easing for label fade/slide, and Framer Motion springs (`damping: 25, stiffness: 200`) for the mobile drawer slide-in — this is the most "designed" motion in the app and could be promoted to a shared token if a motion system is ever formalized. Not currently a token — not found as a CSS variable anywhere.

---

## 10. Teacher Dashboard Extensions (Admin UI)

Extracted from a rigorous compliance audit of the teacher-dashboard surfaces
(`src/app/teacher-dashboard/**`, `src/components/PerformanceThresholdsCard.tsx`,
`src/components/short-answer/FeedbackReportsSection.tsx` +
`FeedbackSettingsCard.tsx`, `src/lib/analytics/band-display.ts`,
`src/components/ui/Button.tsx`, `src/lib/ui/status-badge-styles.ts`). This
admin/data-table surface predates this doc and introduced patterns with no
`/assignments`-page precedent — documented here so they're a deliberate,
checkable tier rather than undocumented drift. An audit against this doc's
own anti-patterns found the teacher dashboard mixing `--primary` and
`--forest` on 9 elements (badges reaching for `bg-primary`/`border-primary`
but defaulting their text to `text-forest`); those were fixed to
single-green (`text-primary`) as part of adding this section — see the
strengthened anti-pattern note below.

### Badge / tag

`rounded-full bg-primary/10 border border-primary/25 text-primary`, padding
`px-1.5–2 py-0.5`, text `10–11px font-semibold` (some add
`uppercase tracking-wide`). Always single-green (`--primary` for bg, border,
*and* text) — never pair with `text-forest`, which is reserved for
interactive links/hover states (see Anti-patterns). Used for: module badges
("Module A"), the "Current" marker in the class/student picker, question-type
tags ("MCQ" / "Short answer"), "Custom" (band-settings override indicator),
"Following the default" (feedback-settings inheritance indicator), "Reviewed"
(feedback-report status).

### Admin / compact Button

`src/components/ui/Button.tsx` + `src/lib/ui/status-badge-styles.ts`. A
**separate, intentional tier** from the assignments-page CTA button (§8) —
this one is for dense admin/data-table contexts (dashboard toolbars, modal
actions, table row actions), not a drift from the CTA spec:

| | Primary | Outline | Icon |
|---|---|---|---|
| Background | `bg-primary` | transparent | transparent |
| Text | `text-white` | `text-primary` | `text-slate-gray/60` |
| Border | none | `border-primary/50` | none |
| Hover | `hover:bg-primary-hover` | `hover:bg-primary-light` | `hover:bg-surface-muted hover:text-slate-gray` |
| Radius | `rounded-lg` (8px) | `rounded-lg` (8px) | `rounded-lg` (8px) |
| Height | auto (~36px via `py-2`, `text-sm`) | auto (~36px) | `h-8 w-8` (32px, fixed square) |

Don't reach for the assignments-page CTA spec (999px pill / 46px) inside the
teacher dashboard, and don't reach for this compact spec on the assignments
page — they're deliberately different tiers for different densities.

### Compact list-row

`rounded-xl` (12px — a **third radius tier**, distinct from this doc's two
card radii in §4), border only (`border-border-subtle` or
`border-border-default`), **no shadow**, `bg-surface` or
`bg-surface-muted/60`. Reserved for repeating dense rows nested *inside* an
already-bordered outer card — question-choice rows, per-student response
rows, feedback-report list items, per-school config boxes. Not for
standalone top-level cards; those still follow §4's 16px/28–32px + border+shadow
rule.

### Stat pill

`rounded-xl border border-border-subtle bg-surface-muted/60 px-3 py-2.5
text-center` — the MCQ/SAQ performance metric tiles (Practice / Exam /
Review / Avg time) on the standard-detail page.

### Chart colors

Recharts/SVG elements prefer `var(--token)` over raw hex wherever a semantic
token exists (e.g. donut/legend swatches and line-chart stroke/dot/label all
use `var(--primary)`, not a hardcoded `#16a34a`) — `var()` resolves correctly
in these exact chart contexts, confirmed in code. Literal Tailwind-scale hex
(e.g. `MODE_BAR_COLORS`'s amber/blue/red for a mode-comparison bar chart)
remains acceptable only when no existing token maps to that hue.

### Modal scrim

Teacher-dashboard modals use `bg-slate-950/50`. Note only, not a rule to
copy: the rest of the app uses several different scrim values (`bg-black/40`,
`bg-slate-900/50`, `bg-black/20`, `bg-black/55`, etc.) with no single
project-wide convention — this is pre-existing, project-wide inconsistency,
out of scope to unify here.

---

## CSS Variables Reference Block

All tokens already exist in `src/app/globals.css` (`:root` / `.dark`). Nothing new needs to be added for a page to reuse this system — just apply the existing `--assignment-*`, `--border-*`, `--surface*`, `--background`, `--foreground`, `--muted-foreground`, `--error-*` variables. Do not redeclare them per-component.

## Tailwind Reference

There is no `tailwind.config.js` to extend (Tailwind v4 CSS-first config). The only Tailwind-facing token surface is the `@theme inline` block in `globals.css` (lines 144–172), which maps `--color-*` / `--font-*` Tailwind theme keys to the CSS variables above:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-surface-muted: var(--surface-muted);
  --color-heading: var(--heading);
  --color-forest: var(--forest);
  --color-slate-gray: var(--foreground);
  --color-muted-foreground: var(--muted-foreground);
  --color-primary: var(--primary);
  --color-border-default: var(--border-default);
  --color-border-subtle: var(--border-subtle);
  --color-error: var(--error-color);
  --color-error-light: var(--error-light);
  --color-error-border: var(--error-border);
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif, ...;
  --font-heading: var(--font-geist), ui-sans-serif, system-ui, sans-serif;
}
```

None of the `--assignment-*` tokens are registered in `@theme inline`, so they are **not** available as Tailwind utility classes (no `bg-assignment-cta-bg` class exists) — they must be consumed via inline `style={{ background: "var(--assignment-cta-bg-strong)" }}`, exactly as the current code does. This is consistent across the whole page; don't try to invent Tailwind utility class names for them.

---

## Anti-patterns

Based on patterns actually observed in this page's code:

- **Don't introduce a new card radius.** Only two exist: 16px (row-level: `AssignmentRow`, `CompletedRow`, banners, agenda cards) and 28–32px (hero-level: `NextStepCard`). Don't add a third.
- **Don't introduce a second green.** `--sidebar-gradient` / `--assignment-completed` (`#0c6b45`) is the one brand green used for "completed"/"primary CTA" semantics. `--primary` (`#16a34a`) exists as a separate, lighter green in the global palette but is not used inside the assignments tree — don't mix the two within one component. **Badges/tags are the highest-risk spot for this**: a real, confirmed instance was found in the teacher dashboard where a badge's `bg-primary`/`border-primary` was paired with `text-forest` on the same element (fixed in §10) — when a tag/pill reaches for `--primary` on its background or border, make sure its text uses `--primary` too, not `--forest`.
- **Don't invent a fourth mode color.** Only `practice` (blue), `exam` (pink/magenta), `review` (gold) exist in `ASSIGNMENT_MODE_META`. If a new assignment mode is ever added, follow the existing `{color, bg}` pair pattern rather than picking an arbitrary hue.
- **Don't use filled icons.** Every icon on this page is `lucide-react` stroke-only, default `strokeWidth`. No solid/filled icon appears anywhere in the tree.
- **Don't add a border-only OR shadow-only card.** Every elevated surface on this page pairs a 1–1.5px hairline border with a matching `--assignment-*-shadow`. Don't drop one and keep the other.
- **Don't set `pillBorder` to anything other than the pill's own background.** This is intentional and consistent across all three mode tags — introducing a visibly different border color for a new tag would break the established (if unusual) pattern.
- **Don't add Tailwind "dead classes."** The codebase has existing instances of a Tailwind class being present but fully overridden by an inline `style` (`text-heading` on the hero title, `rounded-xl` + `bg-surface` on CTA buttons/search bar). These are pre-existing debt, not a pattern to copy — when styling a token-driven value, either use the inline `style` consistently or the Tailwind class, not both.
- **Don't register new `--assignment-*` tokens in `@theme inline`.** None of the existing ones are registered there (by design or oversight — unclear, but consistent). Keep consuming them via inline `style` for continuity, unless a deliberate broader refactor decides otherwise.
- **Don't assume `--assignitem-cta-bg` / `-hover` / `-active` do anything.** They're declared but dead on this page (see §1) — don't copy them into a new component expecting them to be wired to an actual hover/active interaction; the hero CTA actually uses `hover:brightness-110` / `active:brightness-95` Tailwind utilities instead.
- **Don't add dark-mode support for the hero CTA without also checking `--assignment-cta-*`.** As noted, these tokens currently have no `.dark` override — if you fix that, do it in `globals.css`, not by hardcoding a dark variant inline in the component (would repeat the exact anti-pattern already fixed once in this page for the popover/nav-shadow tokens).
