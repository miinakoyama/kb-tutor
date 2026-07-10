# My Assignments Page Redesign Spec

## Goal

Restructure the My Assignments page from a flat list of equal-weight cards into a two-tier layout: a hero "Next Step" card (single highest-priority assignment) + a compact list of remaining assignments. Reduce information density, establish visual hierarchy, and apply the new design system.

---

## 1. Information Architecture (New)

### 1a. Next Step (Hero)

A single prominent card showing the highest-priority incomplete assignment. Displays full detail:

- Status badge (In progress / Not started)
- Assignment title
- Contextual subtitle (e.g. "Continue where you left off" / "Ready to start")
- Mode + Attempt info (e.g. "Practice · Attempt 1 / ∞")
- Progress bar + text (e.g. "3 of 15 answered · 20%")
- Due date
- Primary CTA (Continue / Start)

When there are no incomplete assignments → show empty/completion state.

### 1b. Upcoming Assignments (Compact List)

All remaining incomplete assignments in a table-like row format. Each row shows:

- Status badge (pill)
- Assignment title
- Instructions (single line, truncated)
- Progress (e.g. "0 of 15 answered")
- Due date
- CTA button (Start / Continue)

### 1c. Completed Assignments

**Decision: B — Remove tabs.** Completed assignments appear as a collapsible section below Upcoming, collapsed by default. Click to expand. This keeps everything on one page without the tab switching cost, and visually deprioritizes completed work.

---

## 2. Next Step Selection Rule

Pure function: `selectNextStep(assignments) → { nextStep, others }`

Priority order (first match wins):

| Priority | Status | Overdue? | Sort within |
|----------|--------|----------|-------------|
| 1 | in_progress | no | earliest due date |
| 2 | in_progress | yes | earliest due date |
| 3 | not_started | yes | earliest due date |
| 4 | not_started | no | earliest due date |

Rationale: finish what you started first (reduces cognitive load, leverages loss aversion).

**Not included in this version:**
- Instruction-based dependency (e.g. "complete Assignment 1 first") — future scope, tied to locking feature
- Completed assignments are excluded from selection entirely

### Edge cases

| Case | Behavior |
|------|----------|
| No incomplete assignments | nextStep = null, show completion empty state |
| All overdue | Still picks by priority order above |
| No due date on an assignment | Treated as "due infinitely far in the future" (sorted last within its priority tier) |
| Single incomplete assignment | That one is nextStep, others list is empty |

---

## 3. Field Mapping (old → new)

Every data field from the current design must be accounted for — either kept, relocated, or intentionally removed.

### Next Step Card

| Field | Current location | New location | Change |
|-------|-----------------|--------------|--------|
| Mode badge (Practice/Exam/Review) | Badge row, prominent | Below title, inline text (e.g. "Practice · Attempt 1/∞") | Demoted from badge to metadata text |
| Status badge (In progress/Not started) | Badge row | Top of card, single pill | Kept, promoted to primary signal |
| Overdue indicator | Red badge + red date | Status badge color change or subtle text indicator | Reduced from triple-red to single signal |
| Attempts badge | Badge row | Inline with mode text | Relocated |
| Assignment title | h2 | h2, primary visual element | Kept, promoted |
| Instructions block | Yellow box, always visible | Collapsed or second line under title | Demoted, progressive disclosure |
| Progress bar | Always visible when in_progress | Kept with text | Kept |
| Due date | Bottom of card | Top-right of card | Relocated for scannability |
| CTA (Start/Continue/Retry) | Right column | Bottom-right or right side | Kept |
| CTA (No retries left) | Gray locked button | Same — gray + lock icon | Kept, don't lose this state |
| Past attempts link | Right column, secondary | Below CTA or in overflow | Kept but demoted |

### Upcoming Assignment Row

| Field | Current location | New location | Change |
|-------|-----------------|--------------|--------|
| Mode badge | Badge row | Omitted from row — visible on click/expand if needed | Intentionally removed for density |
| Status badge | Badge row | Left side, single pill | Kept, compact |
| Assignment title | h2 | Primary text in row | Kept |
| Instructions | Yellow box | Single-line truncated text | Simplified |
| Attempts badge | Badge row | Omitted from row | Intentionally removed for density |
| Progress | Full bar + text | Text only (e.g. "0 of 15") | Simplified |
| Due date | Bottom with icon | Right-aligned in row | Relocated |
| CTA | Large button | Compact button | Kept, smaller |
| Overdue indicator | Red badge | Text color or dot indicator | Simplified |

### Completed Assignment Row/Card

**Decision: Confirmed.** Completed row shows:
- Assignment title
- Mode (Practice/Exam/Review)
- Completion date (not due date)
- Score or result (if applicable)
- "Review" CTA (links to history/past attempts)

Fields intentionally dropped: progress bar, instructions, Start/Continue CTA.

---

## 4. CTA States

| State | Label | Style | When |
|-------|-------|-------|------|
| Start | "Start" | Primary (filled green) | not_started, has retries |
| Continue | "Continue" | Primary (filled green) | in_progress |
| Retry | "Retry" | Primary (filled green) | completed but retries available |
| No retries | "No retries left" | Disabled (gray + lock icon) | attempts exhausted |

Open question: should Start and Continue look identical, or should Continue have a visual distinction (e.g. a "play" icon, different shade) to signal "you have progress here"?

---

## 5. Empty / Edge States

| State | What to show |
|-------|-------------|
| No incomplete assignments | Positive message: "All caught up!" or similar, with link to Self Practice or completed history |
| No completed assignments | Simple text: "No completed assignments yet" |
| Loading error | Error banner at top (existing behavior, keep) |
| Single assignment total | Next Step hero only, no Upcoming section |

---

## 6. Out of Scope (this iteration)

- Assignment locking / dependency enforcement
- Sorting / filtering / grouping controls (user-initiated)
- Naming convention enforcement (EFG/NOPV issue)
- Sidebar redesign
- Design token application (separate commit, Step 5)

---

## 7. Implementation Order

| Step | Scope | Commit message convention |
|------|-------|--------------------------|
| 0 | This spec | `docs: add assignments redesign spec` |
| 1 | `selectNextStep()` pure function + unit tests | `feat: add next-step selection logic` |
| 2 | Component restructure (NextStepCard + AssignmentRow), existing styles | `refactor: split assignment list into hero + compact rows` |
| 3 | Verify all fields mapped, handle removed/relocated fields | `fix: ensure no data fields lost in redesign` |
| 4 | Tab structure or section structure (per decision above) | `feat: restructure completed assignments view` |
| 5 | Apply garden color palette + app-scale tokens to tailwind config + components | `style: apply garden design tokens` |
| 6 | Empty states, edge cases, no-retries, no-due-date, long titles | `fix: handle edge states in assignment redesign` |

---

## Visual Spec v2 (Layout B)

### PAGE FRAME
- Content max-width 960px, centered
- Section gap 40px; label-to-content gap 12px
- Page title 30px/600. Remove the subtitle line entirely.

### HERO CARD (Next Step)
- Radius 16, padding 20 (24 horizontal ok)
- Left: progress ring, ~96px diameter, 7-8px stroke.
  Ring fill = completion %. Center = accuracy % (24px/600) with
  "accuracy" caption (12px) under it.
  If not_started: empty ring with a play icon in center (no "0%").
- Right: text stack, 4 lines:
  1. Eyebrow 12px/500 uppercase, letter-spacing 0.4px:
     "PRACTICE · ATTEMPT 1 OF 5" (add "OVERDUE" in error color
     when overdue — this is the ONLY overdue indicator on the hero)
  2. Title 20px/600
  3. Subline 13px secondary: "2 of 5 answered · Due Jul 5, 11:59 PM"
  4. CTA button 15px/500, radius 8. The only filled element on
     the card. No badges anywhere on the hero.

### UPCOMING GRID
- 3 columns (2 on md, 1 on sm), gap 12-16
- Card: radius 12, padding 20, vertical stack:
  1. Mode icon 24-28px (pencil/notepad = practice, timer = exam,
     rotate/refresh arrow = review), single accent color per mode
  2. Title 15px/500, max 2 lines truncated
  3. Progress: 3-4px thin bar + "2 of 5" 12px caption.
     If not_started: no bar, show "5 questions" instead.
  4. Due date 12px secondary; if overdue: error color + clock icon
- Whole card clickable (no button). Hover: border darkens +
  translateY(-1px)
- Show max 6 cards; if more, centered "View all (N)" text link
  (13px/500) below the grid that expands the rest

### COMPLETED SECTION
- Header "Completed (N)" 13px/500 secondary + chevron, collapsed
  by default
- Expanded: max 5 rows + "View all" text link
- Row ~48px height, hairline dividers only (no card per row):
  name 14px/500 — accuracy 13px/500 — date 12px muted — [⋯] menu
- ⋯ menu: "Review" (always); "Retry" (normal when allowed; when
  not allowed: disabled/grayed with reason text "No attempts left"
  — visible, not hidden)

### DATA REQUIREMENTS
- Accuracy % must be surfaced: hero ring center + completed rows.
  If the API doesn't currently return accuracy, derive it from
  existing answer data or add it to the server payload.
- Retry availability must come from assignment settings
  (teacher-configured), not be hardcoded.
