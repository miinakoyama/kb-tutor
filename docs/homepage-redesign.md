# Homepage redesign — plan

Rebuilds the student homepage to match the low-fidelity wireframe. Hard rule for
this work: **every number rendered must trace back to a real query.** Anything
without a data source gets cut, not faked.

## Decisions taken

| Question | Decision |
|---|---|
| Learning-effort time source | **Revised (2026-07-14):** per-question answering time, not sessions. `attempts.time_spent_sec` (MCQ, all modes) + `short_answer_attempts.time_spent_sec` (SAQ, new column) + `page_dwell_events` (Review-tab visible time, new table). `analytics_sessions` was rejected after finding 100% of rows had `ended_at = NULL` — its exit-beacon design loses whole sessions, and it counts idle mount time |
| Badges | **Cut from this version.** No badge schema, no unlock rules exist |
| Review card | Keep the existing *incorrect-questions* semantics (not "choose a topic") |
| "My Learning Journey" (KC coverage) | **Delete**, along with its data layer |

## Where every wireframe value comes from

| Wireframe | Source |
|---|---|
| `42` / `days to go` | `daysUntilExam(schools.keystone_exam_date)` — exists |
| `May 22, 2027` | `formatExamDate` — exists |
| `2h 40m this week` | Sum of per-item answering time (MCQ + SAQ + Review-tab dwell) — **new** |
| `18% more than last week` | Current vs previous period delta — **new** |
| Mon–Sun bars | Per-day buckets in the student's timezone — **new** |
| `67%` / `20%` / `Not started` | `assignment.progress.answered / .total` — exists |
| `Due tomorrow` / `Due Jul 5` | `assignments.due_date` — exists, needs relative formatting |
| `Coco` | `profiles.display_name` — exists |
| Topic mastery radar | `calculateMastery(attempts)` — exists |
| Badges | **No source → cut** |

---

## 1. Backend — Learning effort (revised: attempt-based)

### 1a. Migrations

- `20260714000000_short_answer_attempts_time_spent.sql` — adds
  `time_spent_sec` to `short_answer_attempts` (same semantics as the MCQ
  column). Written server-side by the grade route from a client-measured
  elapsed; pre-existing rows stay NULL (unmeasured).
- `20260714000100_page_dwell_events.sql` — heartbeat table for Review-tab
  visible time: one small row per ≤120s of visible dwell, insert/select-self
  RLS. Unlike `analytics_sessions`, a killed tab loses at most one partial
  interval instead of the whole session.

### 1b. `src/lib/homepage/learning-effort.ts`

Three parallel queries (MCQ attempts, SAQ attempts, dwell events since the
start of the previous calendar month), pure functions on top (so the
bucketing is unit-testable without Supabase):

- `itemSeconds(item)` — non-finite/absent → 0; clamped to a 30-minute
  per-item cap so one stuck timer can't distort a week.
- `bucketByDay(items, timeZone)` — `Intl.DateTimeFormat("en-CA", { timeZone })`
  date keys, the same approach [streak.ts](../src/lib/progress/streak.ts) uses.
- `buildWeeklySeries` / `buildMonthlySeries` / `buildLearningEffort`.
- Any source query failing → `null` (card shows "unavailable"); a partial sum
  presented as the total would be worse than no data.

### 1c. Writers

- MCQ: already recorded (`AdaptivePracticeMode` / `ExamMode`,
  visibility-aware dwell).
- SAQ: `ShortAnswerQuestionView` stamps when a part becomes answerable
  (mount / unlock / hydration), re-stamps after each recorded attempt so a
  retry times only the retry; grade route validates (1s–2h, else NULL) and
  persists.
- Review tab: `usePageDwell("review_tab")` on the bookmarks page — counts
  visible time only, flushes every 30s + on hide/unmount.

Returned shape:

```ts
type EffortBar    = { label: string; seconds: number; isCurrent: boolean };
type EffortSeries = {
  bars: EffortBar[];
  totalSeconds: number;
  previousTotalSeconds: number;
  deltaPercent: number | null;
};
type LearningEffort = { weekly: EffortSeries; monthly: EffortSeries };
```

Both series ship in the initial server render, so the Weekly/Monthly toggle is
pure client state — no refetch, no spinner.

- **Weekly** = Mon–Sun of the current week, compared against the previous week.
- **Monthly** = the current calendar month bucketed by week (W1…W5), compared
  against the previous calendar month. Keeps the same bar-chart shape as weekly.
  (Say the word if you'd rather see ~30 daily bars.)
- `deltaPercent` is `null` when the previous period is 0 — you cannot compute a
  percentage increase from zero. The UI **hides** that line rather than printing
  `∞%` or `100%`.

### 1d. Honest limitations, surfaced in the UI

- **Historical SAQ gap.** SAQ answering time is only recorded from the
  migration onward; older attempts contribute 0. MCQ history is complete.
- **Empty state.** All-zero data from a successful query renders "No practice
  time recorded yet", never a chart of empty bars; a failed query renders
  "unavailable" instead of zeros.

## 2. Backend — smaller pieces

- **`formatDueRelative(iso, timeZone)`** in [due-date.ts](../src/lib/due-date.ts):
  `Overdue` / `Due today` / `Due tomorrow` / `Due Jul 5`. Plus an
  `isDueUrgent()` for the red treatment the wireframe shows on "Due tomorrow".
- **Move the mastery radar fetch server-side.** [ProfileCard](../src/components/home/ProfileCard.tsx)
  currently fetches `attempts` from the *browser* client on mount, which causes a
  loading flash and a second round trip. New `src/lib/homepage/mastery-summary.ts`
  runs `calculateMastery` on the server and passes data down as a prop. The card
  becomes a thin client component (Recharts needs the client boundary; the data
  fetch does not).
- **Delete `src/lib/homepage/kc-coverage.ts`** and its call in
  [page.tsx](../src/app/page.tsx).

## 3. Frontend

### Layout (`HomePageContent`)

```
Your progress
┌──────────────┬─────────────────────────────────────┐
│ Exam         │ Learning effort   [Weekly|Monthly]  │
│ countdown    │ 2h 40m  · 18% more than last week   │
│ 42 days      │ ▁ ▃ ▁ ▅ █ ▂ ▄                        │
└──────────────┴─────────────────────────────────────┘

Assigned work                              View all
┌────────────────────────────────────┬──────────────┐
│ Pre-work    ▓▓▓▓▓░░  67%  Continue →│   Profile    │
│ Assign. 1   ▓▓░░░░░  20%  Continue →│   (avatar,   │
│ Assign. 2   Not started      Start →│    name,     │
├────────────────────────────────────┤    radar)    │
│ Practice independently             │              │
│ ┌──────────┐  ┌──────────┐         │              │
│ │ Review   │  │ Self-Pr. │         │              │
│ └──────────┘  └──────────┘         │              │
└────────────────────────────────────┴──────────────┘
```

Row 1: `lg:grid-cols-[minmax(260px,1fr)_2.4fr]`.
Row 2: `lg:grid-cols-[1fr_360px]`, with the Profile card spanning the left
column's two stacked sections.

### Component changes

| Component | Change |
|---|---|
| `home/LearningEffortCard.tsx` | **New.** Bar chart + Weekly/Monthly segmented toggle + delta line + empty state |
| `home/ExamCountdownCard.tsx` | **New** (extracted from `HomePageContent`). Tall card: uppercase subject, big day count, divider, exam date. Keeps the existing ≤7-day urgency accent |
| `home/AssignedWorkList.tsx` | Rewrite of `QuickStartAssignments`. Wireframe rows are far simpler: title, relative due date, **linear** progress bar + %, CTA. Drops the mode pill, question count, and ring |
| `home/ProfileCard.tsx` | Remove badges + "Preview" pill + Edit Profile button (not in the wireframe). Takes mastery data as a prop |
| `home/QuickStartPracticeReview.tsx` | Replace the dashed "illustration placeholder" boxes with the wireframe's icon + description + CTA. Review keeps its incorrect-questions count and `/bookmarks?tab=needs` target |
| `home/HomeHeader.tsx` | **Delete.** The wireframe has no greeting bar, and its bell is a non-functional decoration with no notification source |
| `home/LearningJourney.tsx` | **Delete** |
| `home/AchievementBadges.tsx` | **Delete** (hardcoded placeholder data) |
| `home/RingProgress.tsx` | **Delete** — only consumers were the two components above |

Section headings become real `h2`s ("Your progress" / "Assigned work" /
"Practice independently"), not the current uppercase micro-labels.

Existing design tokens throughout (`--assignment-glass-bg`,
`--assignment-completed`, `--assignment-row-cta-*`); no new raw hex values.

## 4. Tests

- `src/lib/homepage/learning-effort.test.ts` — **new.** Day bucketing across a
  timezone boundary; NULL / inverted / >6h sessions excluded; delta math;
  `deltaPercent === null` when the previous period is 0; all-empty input.
- `src/lib/due-date.test.ts` — extend for `formatDueRelative` (today / tomorrow /
  overdue / far future).
- `src/app/page.test.tsx` — drop the `kc-coverage` mock, add `learning-effort`
  and `mastery-summary`.

## 5. Order of work

1. Migration + `learning-effort.ts` + tests (backend, verifiable standalone).
2. `formatDueRelative` + `mastery-summary.ts` + tests.
3. `page.tsx` wiring; delete `kc-coverage`.
4. New/rewritten components; delete the four dead ones.
5. `HomePageContent` layout.
6. `npm test` + `npm run lint` + drive the real page.
