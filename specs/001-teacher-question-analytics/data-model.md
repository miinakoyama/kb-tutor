# Phase 1 Data Model: Teacher Question Analytics

**Branch**: `cursor/teacher-question-analytics-ff1f` | **Date**: 2026-05-25

This feature is **read-only**: no new Postgres tables, columns, indexes,
RLS policies, RPCs, views, or migrations are created. This document
captures (a) the **existing** entities consumed by the feature, and
(b) the **TypeScript domain types** introduced in `src/lib/analytics/`
and consumed by the new route handlers, pages, and components.

---

## Consumed Postgres entities (existing, unchanged)

| Table | Columns used | Purpose |
|---|---|---|
| `attempts` | `user_id`, `question_id`, `assignment_id`, `mode`, `standard_id`, `standard_label`, `selected_option_id`, `is_correct`, `time_spent_sec`, `answered_at`, `school_id`, `id` | Source of truth for every aggregate. Already populated and indexed. |
| `profiles` | `id`, `display_name`, `student_id`, `role`, `excluded_from_analytics` | Resolve student display name and exclude excluded students. |
| `school_members` | `school_id`, `student_user_id` | Resolve which students belong to which school. |
| `school_teachers` | `teacher_user_id`, `school_id` | Resolve which schools a teacher teaches. |
| `schools` | `id`, `name`, `teacher_user_id` (legacy) | Resolve school display name and legacy teacher ownership. |
| `generated_questions` | `id`, `payload`, `updated_at` | Question stem / options / correct option / diagram. |
| `assignment_question_snapshots` | `question_id`, `payload`, `created_at` | Fallback question preview for legacy / unpublished bank items. |
| `assignments` | `id`, `title` | Resolve assignment display name for the Student profile filter and answer list. |

No `analytics_events` reads (confidence stats deferred to v1.1 per
research R10). No writes to any table.

---

## TypeScript domain types (new)

All new types live in `src/lib/analytics/`. They are pure data types
(no methods, no Supabase coupling) so they can be unit-tested in
isolation and serialized over the wire.

### Scope inputs

```ts
// src/lib/analytics/teacher-scope.ts (NEW shared helper)
export type AttemptMode = "practice" | "exam" | "review";
export type SourceFilter = "assigned" | "self" | "all";
export type RangeKey = "7d" | "30d" | "all";

export interface ScopedQuery {
  schoolIds: string[];           // teacher's schools (or admin-selected)
  studentIds: string[];          // resolved + excluded filter applied
  range: RangeKey;
  mode: AttemptMode | "compare" | "all";
  source: SourceFilter;
}
```

### Standard drill-down

```ts
// src/lib/analytics/standard-drill-down-server.ts
export type AccuracyBucket = "low" | "mid" | "high";

export interface OptionDistribution {
  optionId: string;
  text: string;
  isCorrect: boolean;
  picks: number;
  share: number;                 // 0..1, picks / total picks for the question
}

export interface QuestionInStandardRow {
  questionId: string;
  preview: {
    text: string;
    imageUrl: string | null;
    options: { id: string; text: string }[];
    correctOptionId: string;
    diagram: { type: string; data: unknown } | null;
  } | null;
  attempted: number;             // total attempts in scope (after dedupe)
  uniqueStudents: number;        // distinct students who attempted in scope
  correct: number;
  accuracy: number;              // 0..1
  bucket: AccuracyBucket;        // derived from STANDARD_* constants
  averageTimeSec: number;        // null-safe avg, 0 when no times
  byMode: Record<AttemptMode, {
    attempted: number;
    correct: number;
    accuracy: number;
  }>;
  optionDistribution: OptionDistribution[];
}

export interface StandardDrillDownPayload {
  standardId: string;
  standardLabel: string;
  summary: {
    totalAttempts: number;
    totalCorrect: number;
    accuracy: number;
    uniqueStudents: number;
    questionsAttempted: number;  // distinct question_ids with attempts >= 1
  };
  questions: QuestionInStandardRow[];   // sorted: accuracy ASC, attempts DESC, id ASC
}
```

### Student profile

```ts
// src/lib/analytics/student-profile-server.ts
export type StudentStatus =
  | "on_track" | "watch" | "struggling" | "not_started";

export interface ChartPoint {
  attemptIndex: number;          // 1-based, x-axis
  answeredAt: string;            // ISO
  rollingAccuracy: number;       // 0..1 over last <= 20 attempts
  cumulativeAccuracy: number;    // 0..1 over all attempts up to this index
  isSmallSample: boolean;        // true while cumulative attempts < 10
}

export interface StudentAttemptRow {
  attemptId: string;
  questionId: string;
  questionStem: string;          // truncated to ~200 chars; full text via drawer
  selectedOptionId: string;
  selectedOptionText: string;
  isCorrect: boolean;
  correctOptionId: string;
  timeSpentSec: number | null;
  mode: AttemptMode;
  assignmentId: string | null;
  assignmentLabel: string;       // "Self-practice" when assignmentId is null
  standardId: string | null;
  standardLabel: string | null;
  answeredAt: string;            // ISO
}

export interface StudentProfilePayload {
  student: {
    id: string;
    label: string;
    classId: string | null;
    classLabel: string;
  };
  summary: {
    totalAttempts: number;
    totalCorrect: number;
    accuracy: number;
    averageTimeSec: number;
    status: StudentStatus;
  };
  filters: {
    assignments: { id: string; label: string }[];  // distinct from this student's attempts
    standards: { id: string; label: string }[];    // distinct from this student's attempts
  };
  chart: ChartPoint[];
  answers: {
    rows: StudentAttemptRow[];
    nextCursor: string | null;   // answered_at of last row, or null when exhausted
  };
}
```

### Question detail drawer

```ts
// src/lib/analytics/question-detail-server.ts
export type ScopeMode = "selected" | "all";   // admin-only "all"

export interface QuestionDetailPayload {
  questionId: string;
  preview: QuestionInStandardRow["preview"];   // shared shape
  standardId: string | null;
  standardLabel: string | null;
  scope: ScopeMode;
  summary: {
    totalAttempts: number;
    uniqueStudents: number;
    correct: number;
    accuracy: number;
    averageTimeSec: number;
    timeP50Sec: number | null;
    timeP90Sec: number | null;
  };
  byMode: Record<AttemptMode, {
    attempted: number;
    correct: number;
    accuracy: number;
    averageTimeSec: number;
  }>;
  optionDistribution: OptionDistribution[];
  // When entered from a Student profile, the caller passes ?studentId=… and
  // we attach this. NOT present otherwise.
  studentContext?: {
    studentId: string;
    label: string;
    selectedOptionId: string;
    isCorrect: boolean;
    answeredAt: string;
    mode: AttemptMode;
  };
}
```

### Sample question

```ts
// src/lib/analytics/sample-question-server.ts
export type SampleMode = "random" | "high_accuracy_first" | "low_accuracy_first";

export interface SampleQuestionPayload {
  questionId: string;
  preview: QuestionInStandardRow["preview"];
  standardId: string;
  standardLabel: string;
  // Position in the current mode's ordering (0-based).
  position: number;
  // Total questions reachable via the current mode (= bank size for the
  // standard, with attempted-first / unattempted-at-end split for the
  // accuracy modes).
  totalAvailable: number;
  // True iff there is no further question past this position for the
  // current mode.
  isLast: boolean;
  // Echo of inputs so the client can advance with "Show another" without
  // tracking state independently.
  mode: SampleMode;
  seed: string;
}
```

---

## Validation rules

These are enforced server-side in the aggregators and route handlers:

| Rule | Where |
|---|---|
| `accuracy ∈ [0, 1]` always; never `NaN` (zero attempts → defined as 0 with `bucket = "low"` only when the row should not normally be returned, since empty rows are filtered upstream) | every `*Row` builder |
| `bucket` derived from `STANDARD_ON_TRACK_MIN_ACCURACY` / `STANDARD_WATCH_MIN_ACCURACY` (from `src/lib/analytics/constants.ts`) to stay consistent with the dashboard's traffic-light | `standard-drill-down-server.ts` |
| `averageTimeSec` excludes `null` `time_spent_sec` rows from the divisor. If all are null → `0` (UI renders "—") | every aggregator |
| `studentIds` MUST exclude `excluded_from_analytics = true` profiles. Untrusted callers cannot bypass; the helper that builds `studentIds` is the only path used by every route | `teacher-scope.ts` |
| Standard drill-down: `questions` only contains rows with `attempted ≥ 1` (FR-054) | `standard-drill-down-server.ts` |
| Question detail (teacher): scope is always the teacher's `studentIds`; `scope` field is `"selected"`. Admin may pass `scope=all` query param to widen | `question-detail-server.ts` + route guard |
| Sample question: mode `random` is the only one that uses the `seed`; the two accuracy modes ignore the seed and use deterministic ordering | `sample-question-server.ts` |
| Sample question: unattempted bank questions appended **after** attempted ones for the accuracy modes (FR-046) | `sample-question-server.ts` |

---

## State transitions

None. The feature is read-only. The only "state" is the URL state on
the new pages (`?range=…&mode=…&source=…&assignment=…&standard=…&
question=…&sampleMode=…&seed=…&skip=…`), which is parsed on each
request and round-tripped to the API.

---

## Relationships (entity graph)

```text
profiles (student)
  ↑ excludes profiles.excluded_from_analytics = true
  ↑ joined to display_name / student_id for labels
  │
  ├─ school_members (student_user_id, school_id) ──→ schools (id, name)
  │                                                     ↑
  │                                                school_teachers
  │                                              (teacher_user_id → school_id)
  │
  └─ attempts (user_id, question_id, assignment_id, standard_id,
              selected_option_id, is_correct, time_spent_sec,
              answered_at, school_id, mode)
        │
        ├─→ generated_questions (id, payload)            [question preview]
        │   ↳ fallback: assignment_question_snapshots
        │
        └─→ assignments (id, title)                       [assignment label]
              └─→ STANDARD_DEFINITIONS (id, label)        [from standards.ts]
                                                          [standards taxonomy is in code, not DB]
```

The teacher dashboard's existing pipeline already touches every node
in this graph; the new feature reuses that traversal.

---

## Storage budget

Per request, the largest in-memory working set is the Standard
drill-down at the realistic ceiling: 30 students × ~1,000 attempts ×
≈ 200 bytes/row ≈ **6 MB** before dedupe, ≈ **2 MB** after dedupe.
That fits comfortably within a Vercel-style Function memory budget
(128 MB default) and serializes to ≈ 50 KB JSON over the wire after
projecting to the `QuestionInStandardRow` shape. No streaming or
chunked transfer is required for v1.

---

## Migrations

**None.** A pre-flight `EXPLAIN ANALYZE` of the planned queries
(documented in research R6) confirmed all required indexes already
exist from the baseline + `20260417...` migrations.

If teacher feedback after v1 reveals slow standard-drill-down loads at
unforeseen scale, a future migration could add a composite
`attempts(standard_id, school_id, answered_at)` index — but that is
explicitly **not** on the v1 critical path and would be its own
migration PR.
