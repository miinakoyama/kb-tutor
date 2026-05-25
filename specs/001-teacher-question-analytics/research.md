# Phase 0 Research: Teacher Question Analytics

**Branch**: `cursor/teacher-question-analytics-ff1f` | **Date**: 2026-05-25

This document captures the technology and pattern decisions for the
feature. All `NEEDS CLARIFICATION` markers were resolved in
`/speckit-clarify`; the items here are the **research follow-ups** that
the plan template requires before Phase 1 can produce data-model.md and
contracts/.

---

## R1: Reusing the existing teacher-dashboard scoping pipeline

### Decision

Every new route handler will reuse the four-step pipeline already proven
in `src/app/api/teacher-dashboard/route.ts`:

1. `supabase.auth.getUser()` → user id.
2. `profiles.role` lookup + `resolveRoleWithServerFallback()` → reject
   anything other than `teacher` or `admin`.
3. For `teacher`: load `school_teachers.school_id` ∪
   `schools.teacher_user_id` → set of school ids.
4. `school_members.student_user_id` filtered to those schools → set of
   student user ids. Then exclude `profiles.excluded_from_analytics`.

The aggregator functions in `src/lib/analytics/*-server.ts` take an
**already-scoped** `userIds: string[]` argument and never re-resolve
scope themselves.

### Rationale

- It is the same code path the dashboard already uses — known correct,
  known tested, known indexed.
- Centralizing the scope resolution in one shape avoids the risk of
  "one endpoint scopes correctly, another silently leaks cross-school"
  (Constitution V).
- Aggregators that take a `userIds: string[]` are unit-testable without
  touching Supabase at all (matches the existing
  `teacher-dashboard-server.test.ts` pattern).

### Alternatives considered

- **Push scoping into Postgres RLS only.** Rejected — the existing
  dashboard uses `createSupabaseAdminClient()` for cross-user reads
  because RLS would otherwise have to allow teachers to read other
  students' attempts. Keeping scope in the server lib is consistent
  with what already works.
- **One mega-endpoint that returns everything for a teacher.**
  Rejected — pre-computes data the user may never view, and makes
  per-endpoint p95 targets harder to enforce.

---

## R2: Exam-attempt deduping

### Decision

All four new endpoints feed their `attempts` rows through
`dedupeAssignmentExamAttempts()` before aggregation.

### Rationale

The existing dashboard uses this dedupe so that an assignment-exam
attempt counts once (the latest final answer per question per
assignment per user). If a new endpoint did not dedupe, its totals
would diverge from the dashboard's totals and violate the spec's
SC-003 ("zero divergence"). The function is pure and already
unit-tested in `exam-attempt-dedupe.test.ts`.

### Alternatives considered

- **Dedupe in SQL via a window function.** Rejected for parity —
  matching the existing in-memory dedupe is cheaper to verify
  end-to-end than maintaining two implementations.

---

## R3: Question stem resolution (preview)

### Decision

For any question id we need to display, we resolve the stem and
options using the existing two-step lookup from
`src/app/api/admin/analytics/questions/route.ts`:

1. `generated_questions.payload` (latest by `updated_at`),
2. `assignment_question_snapshots.payload` as fallback (latest by
   `created_at`).

We extract this logic into a shared helper `resolveQuestionPreviews()`
under `src/lib/analytics/question-preview.ts` (NEW) so that the admin
route and the new teacher routes call the same function.

### Rationale

- Avoids drift between admin Question Quality and teacher views.
- Two-step lookup is needed because some legacy snapshots have stems
  that were later edited in `generated_questions`, and some
  unpublished questions only exist in `generated_questions`.
- Centralizing it makes one obvious place to fix when the question
  schema evolves.

### Alternatives considered

- **Always read from `generated_questions` only.** Rejected — would
  miss legacy snapshots for assignments whose source rows were
  deleted.
- **Always read from `assignment_question_snapshots` only.** Rejected
  — questions that have never been assigned would have no preview.

---

## R4: Accuracy line chart with Recharts

### Decision

The accuracy-over-time chart in the Student profile uses **Recharts**
(`<LineChart>` with one `<Line>` and a single x-axis representing
"attempt index"). Two view modes:

- **Rolling** (default): each point's y = correct count over the
  trailing 20 attempts (per FR-022). When there are fewer than 20
  attempts at that index, the rolling window shrinks to attempts
  seen so far and the `small-sample` indicator (FR-024) is shown
  while < 10 attempts.
- **Cumulative**: each point's y = correct count / total count seen
  so far.

The data array is computed server-side in
`student-profile-server.ts` so the client only receives the chart-
ready points. This keeps client JS small and lets us cache the
computation (the same data drives the answer list summary).

### Rationale

- Recharts is already a project dependency (per `package.json`); no
  new bundle weight.
- Computing the rolling window server-side is one O(n) pass that
  reuses the already-fetched `attempts` array. Doing it client-side
  would force shipping the raw attempt array, which is slower and
  carries more data over the wire.
- Attempt-index x-axis (vs. wall-clock x-axis) was decided in
  /speckit-clarify Q4 and avoids gap distortion from breaks and
  weekends.

### Alternatives considered

- **A custom inline SVG line** (matching the donut pattern in the
  existing dashboard). Rejected — non-trivial axis math, tooltips,
  legends. Recharts pays for itself for one chart.
- **`react-chartjs-2`.** Rejected — would add a new dependency,
  conflict with Constitution V's "no new packages" inclination.

---

## R5: Sample-question ordering (FR-044, FR-045, FR-046)

### Decision

The selection-mode orderings are computed by the
`/api/teacher-dashboard/standards/[standardId]/sample` endpoint based
on the **same in-scope aggregates** the drill-down endpoint already
produces for that standard. Specifically:

- `Random`: `Array.shuffle` with a per-modal-session seed (the seed
  is generated client-side and passed as a query param so "Show
  another" cycles deterministically through a stable ordering).
- `High accuracy first`: sort `(accuracy DESC, attempts DESC, id ASC)`.
- `Low accuracy first`: sort `(accuracy ASC, attempts DESC, id ASC)`.
- Unattempted bank questions append at the end (FR-046).

The endpoint accepts `mode`, `seed`, and `skip` query params. `skip`
advances through the ordering for "Show another".

### Rationale

- Reusing the drill-down aggregates means one server pass produces
  both the standard drill-down and the sample-question ordering;
  cache locality is good.
- Client-supplied seed lets us avoid persisting modal state
  server-side. Closing and reopening the modal generates a new seed
  → fresh shuffle for `Random` (FR-047 says mode persistence is
  per-session only).
- The deterministic tie-breakers (attempts DESC, id ASC) satisfy
  the Edge Cases bullet about repeated timestamps and same-bucket
  ordering.

### Alternatives considered

- **Server-side random with no seed.** Rejected — "Show another"
  would have no way to know which questions have been shown,
  leading to repeats or to a server-side session store (overkill).
- **All bank questions for that standard included in the
  ordering, even unattempted.** Rejected by FR-046 — places
  unattempted questions at the end so accuracy modes stay
  meaningful.

---

## R6: Index coverage for the hot paths

### Decision

Verified that the queries the new endpoints issue are all backed by
existing indexes from prior migrations:

| Query | Index used | Migration |
|---|---|---|
| `attempts WHERE user_id IN (…) AND answered_at >= …` | `attempts_user_id_idx`, `attempts_user_id_answered_at_idx` | baseline + `20260417...` |
| `attempts WHERE question_id = …` | `attempts_question_id_idx` | baseline |
| `school_members WHERE school_id IN (…)` | `school_members_school_id_idx` | baseline |
| `school_teachers WHERE teacher_user_id = …` | `school_teachers_teacher_user_id_idx` | baseline |
| `profiles WHERE id IN (…)` | PK | baseline |
| `generated_questions WHERE id IN (…)` | PK | baseline |
| `assignment_question_snapshots WHERE question_id IN (…)` | `aqs_question_id_idx` | baseline |

No new indexes required for v1.

### Rationale

- Reusing the dashboard's exact query shapes inherits its index plan.
- A future "history of question stem edits" or "show me all attempts
  on a specific option in this question" feature might want a
  composite `(question_id, selected_option_id)` index, but that is
  not on the v1 critical path and would only marginally help the
  current per-question panel.

### Alternatives considered

- **Materialized views per standard.** Rejected as premature
  optimization — the existing pipeline already returns inside the
  500ms p95 budget at the realistic data volume (≈ 30 students × ≤
  1,000 attempts).

---

## R7: Pagination for the Student profile answer list

### Decision

The student answer list is paginated server-side, page size **50**.
The endpoint accepts `cursor` (the `answered_at` of the last row
shown, optional) and returns `{ rows, nextCursor }`. Tie-breaker on
duplicate timestamps is the attempt id (matching FR-026).

### Rationale

- 50 fits one viewport on a Chromebook without overwhelming. The
  teacher can scroll or "Load more" to advance.
- Cursor-based pagination (vs offset) avoids the standard `OFFSET`
  performance cliff at large attempt histories and is the same
  pattern the existing analytics code uses (`pagination.ts`).

### Alternatives considered

- **Page size 100 with offset pagination.** Rejected — offset is
  fine at small N but degrades and is harder to reason about.
- **Infinite scroll with no pagination at all.** Rejected — for a
  student with thousands of attempts the chart payload alone would
  blow the perf budget.

---

## R8: Drawer vs dedicated route for the question detail surface

### Decision

The question detail surface is a **`<dialog>`-based drawer** rendered
on top of the current page (Standard drill-down or Student profile).
The drawer reads `?question=<id>` from the URL search params, so the
state is shareable and the browser back button closes the drawer.

For admins who specifically want a deep-link page (e.g., to send a
"is this question buggy?" Slack message), the drawer URL itself
serves that purpose; we do not need a separate `/teacher-dashboard/
questions/[id]` route for v1.

### Rationale

- Drawer keeps context (the standard or student the teacher was
  looking at) instead of forcing a full navigation, which is the UX
  the teacher actually wants.
- URL-state lets the drawer be deep-linked and back-button-friendly
  without a separate route.
- Saves a route file and avoids splitting the same data fetch
  across two page boundaries.

### Alternatives considered

- **A dedicated `/teacher-dashboard/questions/[id]` route.**
  Rejected for v1 — extra routing for marginal UX benefit. Could
  be added in v1.1 if teacher feedback asks for it.
- **A modal centered overlay.** Rejected — too small for a
  question stem + options + per-option distribution + per-mode
  breakdown. Drawer-from-right gives more room and feels less
  blocking.

---

## R9: Default sort for the Standard drill-down

### Decision

Default sort: **`accuracy ASC, attempts DESC, question_id ASC`**.
That is: lowest-accuracy questions first, ties broken by attempts
(more data → more trustworthy ordering), then by question id for
determinism. The teacher can toggle to other sorts via column
headers ("Attempted", "Accuracy", "Avg time"), but the page lands on
"what needs re-teaching most".

### Rationale

- Matches the spec's SC-001: "Identify the specific question(s)
  driving low accuracy in 3 clicks or fewer". Lowest-first means
  zero extra clicks for the headline use case.
- Same direction the dashboard's existing standard table uses for
  the "Needs review" filter chip.

### Alternatives considered

- **`attempts DESC` (most-attempted first).** Rejected — surfaces
  popular questions, not problematic ones.
- **`accuracy ASC` with no `attempts DESC` tiebreak.** Rejected —
  a question with 1 attempt and 0% accuracy would outrank a
  question with 50 attempts and 30% accuracy, which is the
  opposite of what the teacher wants.

---

## R10: Should the per-question detail include confidence stats?

### Decision

**No** for v1. The admin Question Quality view shows confidence
stats (`confidence_submitted` events with `overconfidentWrong` /
`underconfidentRight` buckets), but the teacher's job is "which
items to re-teach", not "which items are psychometrically
broken". Including confidence on the teacher surface would
overload the panel for the headline use case and increase the
endpoint cost.

If teacher feedback later asks for it, we can surface it as an
opt-in section in v1.1.

### Rationale

- Keeps the teacher surface focused (Constitution II — single
  primary task).
- Skips the `analytics_events`-table query and its
  per-question-per-user-per-school iteration, which is the heaviest
  part of the admin Question Quality endpoint.
- Mirrors the spec's "Plan-deferred" checklist item that explicitly
  recorded this as a v1 no.

### Alternatives considered

- **Include confidence by default.** Rejected per above.
- **Opt-in toggle.** Deferred to v1.1 — not on the v1 surface.

---

## Summary

All 10 research items are resolved. No `NEEDS CLARIFICATION` markers
remain. Phase 1 (data-model.md, contracts/, quickstart.md) can
proceed.
