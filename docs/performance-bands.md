# Performance Bands & Status Tags

This document explains how the Teacher Dashboard classifies students and
standards into performance bands. Bands are aligned with the four
Pennsylvania **Keystone Biology** performance levels:

- **Below Basic**
- **Basic**
- **Proficient**
- **Advanced**

A fifth state, **Not Started**, is shown when the student or standard has
no recorded attempts in the current filter window.

---

## Accuracy

Accuracy is the percentage of multiple-choice attempts a student answered
correctly within the active filters (topic, school, student, date range,
source, mode):

```
accuracy_percent = round( correct_attempts / total_attempts * 100 )
```

- Attempts are pulled from the `attempts` table.
- When **mode = compare**, accuracy is also reported per mode
  (practice / exam / review).
- When **mode = exam** in an **assignment**, only the latest answer per
  question is counted (assignment-exam dedupe), so a student who changes
  their answer is not double-counted.
- Attempts with `time_spent_sec = NULL` are still counted toward accuracy
  but excluded from the average-time calculation.

For accuracy by **standard**, the same formula is applied to attempts
grouped by `standard_id`. Standards without a registered ID are bucketed
by topic so that unrelated topics are not merged.

---

## Performance bands

A student or standard band is decided from accuracy within the active
filters. The thresholds are inclusive lower bounds and use the same
defaults for student rows and standard rollups.

| Band         | Default rule                | Meaning                                            |
| ------------ | --------------------------- | -------------------------------------------------- |
| Advanced     | `accuracy ≥ 85%`            | Mastery; mostly independent recall and reasoning.  |
| Proficient   | `70% ≤ accuracy < 85%`      | On track for the Keystone exam.                    |
| Basic        | `50% ≤ accuracy < 70%`      | Approaching proficiency; revisit core concepts.    |
| Below Basic  | `accuracy < 50%`            | Needs re-teaching of the underlying standards.     |
| Not Started  | `attempts = 0`              | No data in the active filter window.               |

### Clicking without engaging ("low + fast")

In addition to the band, students can be flagged with a **Clicking
without engaging** badge. This catches the pattern of guessing rapidly
without actually reading the question. A student is flagged only when
**all** of the following hold:

- attempts in the window ≥ `10` (avoids noise on small samples),
- accuracy `< 50%`,
- average time per question `< 30s` (and the average is measured, not
  `NULL`).

This flag is independent of the band — a student can be in any band and
still be flagged if their answering rhythm is unusually fast and wrong.

---

## Standard rollups

For each Keystone standard the dashboard rolls up every attempt across
the visible roster, then applies the same band cutoffs used for student
rows.

---

## Customizing the thresholds

The defaults above are intended to align with Keystone Biology cut
scores, but each teacher can override them from the **Teacher
Dashboard → Edit performance bands** modal. The overrides:

- are stored per teacher in the `teacher_performance_thresholds` table,
- apply only to the dashboards that teacher sees,
- never change the underlying attempt data — only the band that is shown.

When a teacher resets their thresholds, the dashboard falls back to the
default values listed in this document.

### Validation rules

To keep the bands monotone, the editor enforces:

```
0 ≤ basic_min ≤ proficient_min ≤ advanced_min ≤ 100
```

The same threshold set is applied to both student rows and standard
rollups.

---

## Where the values live in code

- Default thresholds and the low-and-fast cutoffs: `src/lib/analytics/constants.ts`
- Band classification logic: `src/lib/analytics/teacher-dashboard-server.ts`
- Per-teacher overrides (DB schema): `supabase/migrations/*_teacher_performance_thresholds.sql`
- API for reading / saving overrides: `src/app/api/teacher/performance-thresholds/route.ts`
- Dashboard UI (band labels, tooltips, editor): `src/app/teacher-dashboard/page.tsx`
