# Feature Specification: Teacher Question Analytics

**Feature Branch**: `cursor/teacher-question-analytics-ff1f`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description: "Teacher-facing question analytics: per-standard drill-down, per-student progression, per-question stats, sample question button"

## Clarifications

### Session 2026-05-25

- Q: For the "Sample question" button (FR-044), what is the selection logic? → A: The teacher chooses the selection mode from three presets — `random`, `high-accuracy first` (warm-up: confidence-building items), and `low-accuracy first` (focus question: items the class is currently struggling with). `random` is the default. The chosen mode persists across "Show another" clicks within the same modal session.
- Q: For the Standard drill-down (FR-054), should the list include unattempted bank questions? → A: Attempted questions only (one row per question, `attempts ≥ 1` in scope). Untouched bank questions surface via the Sample-question modal and the question manager, not via the standard drill-down.
- Q: Where does the per-question stats surface (FR-030) live for teachers? → A: A new teacher-accessible question detail surface (drawer / sheet / dedicated route) opened from the Standard drill-down rows and from the Student profile's answer-list rows. The existing admin-only `/content/questions` manager is **not** opened to teachers; it retains its current admin-only CRUD/mass-production scope. Admins reach the same new surface from the same entry points and can additionally toggle scope to "All schools".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Drill into a standard to inspect every attempted question (Priority: P1)

A teacher opens the Teacher Dashboard "Performance by standard" table, sees that
Standard A has 296 attempts across her class, and clicks the standard row.
A new screen lists every question her students attempted under that standard,
with each question color-coded by accuracy (e.g., red = mostly wrong, amber = mixed,
green = mostly right). For each question she can see how many students attempted
it, how many got it right, and the answer-choice distribution. She can preview the
question stem and options inline so she knows what content is failing.

**Why this priority**: This is the central request the teacher made ("Is there a way
to see the 296 questions attempted for Standard A? Could they be color coded by how
often they were right/wrong?"). It also unlocks every downstream analysis (which
questions are "buggy", which need re-teaching, which to use as warm-ups). Without
it the dashboard remains a summary with no way to investigate the underlying items.

**Independent Test**: Can be fully tested by signing in as a teacher whose class has
at least one standard with multiple attempted questions, navigating from the standard
row on the dashboard to the new drill-down view, and verifying that every attempted
question appears with correct counts, accuracy %, color coding, and answer-choice
distribution scoped to that teacher's students only.

**Acceptance Scenarios**:

1. **Given** the teacher is on the dashboard and Standard A shows 296 attempts,
   **When** she clicks the Standard A row,
   **Then** she lands on a Standard detail view that lists every distinct question her
   students attempted under Standard A with: question stem preview, total attempts
   (across her students), distinct students who attempted, correct-count, accuracy %,
   and a color tone reflecting the accuracy bucket.
2. **Given** the Standard detail view is open,
   **When** she expands a single question,
   **Then** she sees the full question with options, the correct option highlighted,
   per-option pick counts/percentages, and a small per-mode breakdown
   (practice / exam / review).
3. **Given** the current dashboard filters (date range, source = assigned/self,
   class/school) are applied,
   **When** she opens the Standard detail view,
   **Then** the same filters apply to the listed questions and counts.
4. **Given** the teacher is logged in,
   **When** she opens the Standard detail view for any standard,
   **Then** every count, percentage, and listed student is restricted to students in
   schools she is associated with — no data from other teachers' schools appears.

---

### User Story 2 - Click a student to see their progress over time (Priority: P1)

From the Teacher Dashboard "All students" table the teacher clicks a student's
name. A student profile view opens with a line chart of accuracy over time so she
can distinguish "11 of 12 correct" (small sample) from "99 of 100 correct" (large
sample, established mastery). She can filter the chart by assignment and by
standard. Below the chart she sees a paginated list of every question that
student has answered, with the student's selected option, whether it was correct,
the timestamp, the assignment (if any), and the standard.

**Why this priority**: Two of the four teacher requests collapse into this view —
"When I filter a specific student, can I see all of the questions they answered?"
and "Could the graph track their accuracy over time, filtered by assignment/
standard?" Identifying which students need targeted remediation is the teacher's
top decision, and the dashboard's current "Struggling/Watch/On track" pills are
not enough on their own.

**Independent Test**: Can be fully tested by clicking any student in the dashboard
roster, verifying that the resulting view loads a chart with at least one data
point per attempt for that student, that the assignment and standard filters narrow
the chart and the answer list correctly, and that the answer list shows the
correct selected option vs. correct option for every attempt.

**Acceptance Scenarios**:

1. **Given** the teacher is on the dashboard and a student row is visible,
   **When** she clicks the student's name,
   **Then** she lands on a student profile view that shows the student's name,
   total attempts, overall accuracy, and a time-series chart of accuracy.
2. **Given** the student profile view is open,
   **When** she changes the assignment filter from "All" to a specific assignment,
   **Then** the chart, summary counts, and answer list update to include only
   attempts that belong to that assignment.
3. **Given** the student profile view is open,
   **When** she changes the standard filter to a specific standard,
   **Then** the chart, summary counts, and answer list update to include only
   attempts on questions tagged with that standard.
4. **Given** the answer list is visible,
   **When** she scrolls or paginates,
   **Then** each row shows: question stem (truncated, expandable), the option the
   student picked, whether it was correct, time spent, mode, assignment label,
   standard, and timestamp.
5. **Given** the chart shows fewer than the configured minimum sample size,
   **When** she views it,
   **Then** the chart still renders but a clear "small sample" indicator is shown
   so she can distinguish high accuracy from high *confidence* in accuracy.

---

### User Story 3 - View per-question stats from a question detail surface (Priority: P2)

From either the Standard drill-down (Story 1) or the Student profile's answer
list (Story 2), the teacher opens a question detail view (a drawer or
dedicated page, not the admin question manager) and sees how many times the
question has been asked in her class, how often it was answered correctly, the
answer-choice distribution, average time, and which standard it is tagged
with. This helps her flag weak / "buggy" / ambiguous questions for the admin
to fix.

**Why this priority**: The teacher explicitly asked for this ("if I look up a
specific question in the manager, can I see how many times it has been asked
and gotten correct?"). It is independently valuable but lower priority than the
dashboard drill-downs because the same numbers are available from the Standard
detail view (Story 1) — this story is about giving teachers a question-first
entry point that is read-only and safe to expose to non-admins.

**Independent Test**: Can be fully tested by clicking a question row in the
Standard drill-down or an attempt row in the Student profile and verifying that
the question detail surface renders with attempt count, correct count, accuracy
%, and per-option distribution scoped to the teacher's students, and that no
admin-only mutation controls are present.

**Acceptance Scenarios**:

1. **Given** the teacher is on the Standard drill-down view and clicks a
   question row, **When** the question detail surface opens,
   **Then** an analytics panel shows: total attempts, distinct students,
   correct count, accuracy %, average time, per-mode breakdown, and per-option
   pick counts/percentages, all scoped to her students.
2. **Given** the teacher is on the Student profile view and clicks an attempt
   row, **When** the question detail surface opens,
   **Then** the same analytics panel is shown for the same `question_id`, with
   counts/percentages matching what the Standard drill-down would show for the
   same question and scope.
3. **Given** the question has zero attempts in scope,
   **When** the panel renders,
   **Then** it shows an empty state ("No students have attempted this question
   yet") rather than misleading 0% accuracy.
4. **Given** the teacher is an admin,
   **When** she opens the same surface,
   **Then** she sees a scope toggle to switch between "Selected schools" and
   "All schools" — but never lands on the admin `/content/questions` manager
   by accident; the surface is the same read-only one teachers see.
5. **Given** the viewer is a non-admin teacher,
   **When** the surface renders,
   **Then** no create/edit/delete/mass-produce/approve controls are visible
   anywhere on the surface.

---

### User Story 4 - Get a sample question for any standard from the dashboard (Priority: P2)

Next to each standard row on the Teacher Dashboard there is a "Sample question"
button. Clicking it opens a modal that surfaces one question from that standard.
The teacher can choose the **selection mode** for the sample — `Random`,
`High accuracy first` (good for warm-ups / confidence-building), or
`Low accuracy first` (good for focus questions / class-wide remediation) —
mirroring how the state's CDT supplies sample items per standard. The shown
question is text the teacher can copy or project; she can request a different
sample of the same mode if the first one isn't a good fit.

**Why this priority**: Independently useful classroom workflow that does not
block any other story. P2 because it is a discrete UI affordance, not a deep
analytics view, and the teacher framed it as "could we have a button…" rather
than a critical request.

**Independent Test**: Can be fully tested by clicking the "Sample question"
button on any standard row and verifying that a question for that standard is
shown with stem and options, that "Show another" returns a different question
when the bank has more than one, and that the dialog has a clear way to copy or
project the question.

**Acceptance Scenarios**:

1. **Given** the dashboard "Performance by standard" table is visible,
   **When** the teacher clicks "Sample question" on a standard row,
   **Then** a modal/sheet opens showing one question tagged with that standard,
   including stem, options, and the correct option marked for the teacher.
   The modal defaults to `Random` selection mode.
2. **Given** the sample-question modal is open,
   **When** the teacher switches the selection mode to `High accuracy first`,
   **Then** the displayed question changes to the question tagged with that
   standard that has the highest in-scope accuracy among the teacher's students
   (ties broken by attempt count, then by question id for determinism).
3. **Given** the sample-question modal is open,
   **When** the teacher switches the selection mode to `Low accuracy first`,
   **Then** the displayed question changes to the question with the lowest
   in-scope accuracy (same tie-break order).
4. **Given** the sample-question modal is open in any selection mode,
   **When** the teacher clicks "Show another",
   **Then** a different question (next in the current mode's order, when
   available) is shown; if no more questions exist for that mode, the button is
   disabled with a message ("No more questions for this mode").
5. **Given** the standard has no questions in the question bank,
   **When** the teacher clicks "Sample question",
   **Then** the modal shows an empty state explaining no sample is available.
6. **Given** the selection mode is `High accuracy first` or `Low accuracy first`
   and some questions in the bank have zero in-scope attempts,
   **When** the teacher iterates through the modal,
   **Then** those unattempted questions are shown *after* every attempted
   question has been shown for that mode, so accuracy-based ordering remains
   meaningful while still letting the teacher reach un-tried questions.

---

### Edge Cases

- A teacher associated with multiple schools opens a standard drill-down: counts
  must aggregate across her schools, and the existing School filter on the
  dashboard must continue to scope the drill-down correctly.
- Some attempts have `time_spent_sec = NULL` (legacy rows): they must not
  contaminate average-time displays — exclude them from the average and show
  "—" if the entire bucket is null.
- A student appears in the dashboard but is marked
  `excluded_from_analytics = true`: they must not appear in the standard
  drill-down, in any per-question stats, or in the student profile view.
- A student answered the same question multiple times in different modes (e.g.
  practice and exam): per-question accuracy and counts must follow the existing
  dashboard's deduping rule (`dedupeAssignmentExamAttempts`) so totals match the
  parent dashboard summary.
- A question's stem or options were edited after students attempted it: the
  drill-down must show the latest stem the teacher would actually use as a
  warm-up, but the per-option pick counts must still reflect the original
  selections (the stable option ids in the `attempts` table).
- A standard exists in `STANDARD_DEFINITIONS` but no question in the bank is
  tagged with it: "Sample question" shows an empty state; the standard row may
  still show 0 attempts.
- The teacher applies the "Source = self" filter: the drill-down lists only
  self-practice attempts (no `assignment_id`), matching the dashboard's existing
  source filter semantics.
- Two attempts have the same timestamp: the time-series chart and answer list
  must order them deterministically (e.g. by attempt id) so the same data always
  renders the same way.
- A student exists in the roster but has zero attempts: clicking their name
  opens the profile view with empty chart, an "No attempts yet" empty state, and
  no broken UI.

## Requirements *(mandatory)*

### Functional Requirements

#### Access control & scoping

- **FR-001**: System MUST gate every new analytics endpoint on the same role
  rules already enforced by `/api/teacher-dashboard` — authenticated users with
  role `teacher` or `admin`. Students MUST receive 403.
- **FR-002**: For users with role `teacher`, the System MUST restrict every
  count, percentage, listed student, and listed attempt to attempts authored by
  students in schools the teacher is associated with via `school_teachers` or
  `schools.teacher_user_id` (mirroring the existing teacher dashboard scoping).
- **FR-003**: For users with role `admin`, the System MUST behave the same as
  the teacher endpoints by default (i.e., scoped to schools selected via the
  dashboard's School filter) and MUST additionally allow widening the scope to
  all schools when an explicit "All schools" filter is chosen.
- **FR-004**: System MUST exclude students whose profile has
  `excluded_from_analytics = true` from every count, list, and per-question
  aggregate in the new screens.

#### Standard drill-down (Story 1)

- **FR-010**: System MUST add a way for the teacher to navigate from the
  "Performance by standard" table on `/teacher-dashboard` to a Standard detail
  view for that standard.
- **FR-011**: The Standard detail view MUST list every distinct question that
  has been attempted by the teacher's in-scope students under that standard,
  honoring the dashboard's current filters (date range, source, school, mode).
- **FR-012**: For each listed question the System MUST display, in scope: a
  preview of the question stem, total attempts, distinct students attempted,
  correct count, accuracy %, average time, and a per-mode breakdown
  (practice / exam / review).
- **FR-013**: Each question row MUST be color-coded into at least three buckets
  by accuracy: low (mostly wrong), mid (mixed), high (mostly right). The
  thresholds MUST reuse the existing `STANDARD_*` accuracy constants where
  possible to stay consistent with the dashboard's traffic-light language.
- **FR-014**: Each question row MUST be expandable to show the full question
  with options, the correct option marked, and per-option pick counts and
  percentages.
- **FR-015**: When the dashboard is filtered to a single student, the Standard
  detail view MUST show that student's question-level activity (and clearly
  label that it is filtered to one student) rather than aggregate counts.

#### Student profile (Story 2)

- **FR-020**: System MUST add a Student profile view reachable by clicking a
  student's name on the dashboard.
- **FR-021**: The Student profile view MUST display the student's name, total
  attempts, overall accuracy, average time, and a status badge consistent with
  the dashboard's existing student status classification.
- **FR-022**: The Student profile view MUST render a line chart of the
  student's accuracy over time. The chart MUST support a rolling-window view
  (default) and a cumulative view, so the teacher can see both recent trend and
  long-run mastery.
- **FR-023**: The chart, summary counts, and answer list MUST be filterable by
  assignment and by standard. Both filters MUST default to "All".
- **FR-024**: When the displayed sample size is below a configured threshold
  (default: 10 attempts in the current view), the chart MUST show a clear
  "small sample" indicator so the teacher does not over-interpret short streaks.
- **FR-025**: Below the chart the System MUST show a paginated list of the
  student's attempts. Each row MUST include: question stem (truncated,
  expandable), the option the student selected, whether it was correct, time
  spent, mode, assignment label (or "Self-practice"), standard, and answered_at
  timestamp.
- **FR-026**: The answer list MUST sort by `answered_at` descending by default
  and break ties deterministically (e.g., by attempt id).

#### Per-question stats (Story 3)

- **FR-030**: System MUST expose per-question analytics through a **new
  teacher-accessible question detail surface** (e.g., a drawer/sheet or a
  dedicated route under the teacher dashboard). The existing admin-only
  `/content/questions` manager MUST NOT be opened to teachers; it retains its
  current admin-only CRUD / mass-production / approval responsibilities.
- **FR-030a**: The question detail surface MUST be reachable from:
  (1) each question row in the Standard drill-down (Story 1), and
  (2) each attempt row in the Student profile's answer list (Story 2).
  Both entry points MUST navigate to the same surface for the same
  `question_id` so the underlying analytics are consistent.
- **FR-030b**: The question detail surface MUST be **read-only**: it MUST NOT
  expose create/edit/delete actions, mass-production controls, approval state
  changes, or any other mutation affordance, regardless of the viewer's role.
  Admins who need to edit questions MUST continue to use the existing
  `/content/questions` manager.
- **FR-031**: The per-question analytics panel MUST show, in scope: total
  attempts, distinct students, correct count, accuracy %, average time, per-mode
  breakdown, and per-option pick counts/percentages.
- **FR-032**: The panel MUST present a clear "no attempts yet" empty state when
  scope yields zero attempts, instead of showing 0%.
- **FR-033**: For admin users, the panel MUST allow toggling between
  "Selected schools" and "All schools" scope. For teacher users, the toggle
  MUST NOT be shown — scope is locked to the teacher's schools.

#### Sample question button (Story 4)

- **FR-040**: System MUST render a "Sample question" affordance on each row of
  the dashboard's "Performance by standard" table.
- **FR-041**: Activating "Sample question" MUST open a modal/sheet that shows
  one question whose `standard_id` matches the row's standard, including stem,
  options, and the correct option marked for the teacher.
- **FR-042**: The modal MUST include a "Show another" action that returns a
  different question from the bank (next in the current mode's order, when
  more exist) and disables itself once the bank is exhausted for the current
  mode and standard.
- **FR-043**: When the question bank for that standard is empty, the modal MUST
  show an empty state ("No sample question available for this standard").
- **FR-044**: The modal MUST expose a selection-mode picker with three options:
  `Random` (default), `High accuracy first`, and `Low accuracy first`. Switching
  the mode MUST immediately update the displayed question to the first item
  under the new mode's ordering.
- **FR-045**: The `High accuracy first` and `Low accuracy first` orderings MUST
  be computed from in-scope attempts (the same scope as the dashboard: the
  teacher's students, honoring active filters). Tie-breakers MUST be applied in
  this order: (1) higher in-scope attempt count first (more data = more
  trustworthy ordering), (2) lexicographic question id (for full determinism).
- **FR-046**: For accuracy-based modes, questions with zero in-scope attempts
  MUST be placed at the end of the ordering, not interleaved, so the modal
  remains usable even for standards where most bank questions are untouched.
- **FR-047**: The chosen selection mode MUST persist for the lifetime of the
  modal session (i.e., across "Show another" clicks). It is not required to
  persist across modal close/reopen.

#### Cross-cutting

- **FR-050**: All new server endpoints MUST re-verify the user via
  `supabase.auth.getUser()` and re-resolve the role via
  `resolveRoleWithServerFallback()` inside the handler, not rely on middleware.
- **FR-051**: All new screens MUST keep the dashboard's existing filter chrome
  (date range, source, mode, school, student, topic) visible and effective so a
  teacher does not "lose" her filter context when she drills in.
- **FR-052**: All new screens MUST expose a "Download CSV" action consistent
  with the existing dashboard CSV pattern, so teachers can share findings with
  colleagues.
- **FR-053**: All new endpoints MUST use the same exam-attempt deduping
  (`dedupeAssignmentExamAttempts`) as `/api/teacher-dashboard` so totals match
  the parent dashboard.
- **FR-054**: When a teacher drills into a standard from the dashboard, the
  Standard detail view MUST list **only questions with at least one in-scope
  attempt** (one row per question). Bank questions that this teacher's students
  have never attempted MUST NOT appear in the list. This keeps the view faithful
  to the teacher's intent ("the 296 questions attempted for Standard A") and
  avoids diluting the color-coded view with rows that carry no signal. Untouched
  bank questions remain reachable via the "Sample question" modal (Story 4) and
  via the question manager surface (Story 3).

### Key Entities *(include if feature involves data)*

- **Standard**: A curriculum standard (id like `3.1.9-12.A`, label, module,
  category). Already defined in `STANDARD_DEFINITIONS` and on each `attempts`
  row as `standard_id` / `standard_label`.
- **Question**: A multiple-choice item with stem, options, and a correct option
  id. Stored in `generated_questions` and snapshotted in
  `assignment_question_snapshots`. Tagged with `standard_id`.
- **Attempt**: One student answering one question once. Captures `user_id`,
  `question_id`, `assignment_id` (nullable for self-practice), `mode`,
  `selected_option_id`, `is_correct`, `time_spent_sec`, `standard_id`,
  `standard_label`, `answered_at`, `school_id`. The fundamental fact table
  for every aggregate in this feature.
- **Student (Profile)**: A user with role `student`. Visible in scope iff the
  teacher is associated with one of the student's schools and the student is
  not `excluded_from_analytics`.
- **Class / School**: The scoping unit. Teachers see students whose
  `school_members.school_id` matches a school the teacher teaches.
- **Question scope**: A derived concept: the set of attempts to aggregate over
  for a given (teacher, standard, time range, mode, source, optional student)
  selection. Every new view in this feature is parameterized by this scope.
- **Sample question**: A representative question for a given standard, surfaced
  from the question bank for use as a class warm-up.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A teacher can go from seeing a standard with low accuracy on the
  dashboard to identifying the specific question(s) driving that low accuracy
  in **3 clicks or fewer** (dashboard → standard row → expand the worst
  question).
- **SC-002**: A teacher can go from the dashboard to a single student's
  accuracy-over-time chart in **2 clicks or fewer**, and the chart loads in
  **under 2 seconds** for a class of 30 students with up to 1,000 attempts.
- **SC-003**: For any question in scope, the displayed total attempts and
  correct counts on the per-question panel **match** the totals shown on the
  Standard detail view and the Teacher Dashboard summary for the same filters
  (zero divergence is required — if numbers ever differ, the feature has a bug).
- **SC-004**: The "Sample question" modal opens and renders a usable question
  in **under 1 second** for any standard with at least one tagged question.
- **SC-005**: 100% of the new endpoints reject requests from `student` role with
  HTTP 403 and reject unauthenticated requests with HTTP 401, verified by
  automated tests.
- **SC-006**: 0 attempts authored by students outside the requesting teacher's
  schools appear in any of the new views, verified by automated tests using
  fixture data with cross-school students.
- **SC-007**: After a sprint of classroom use, the teacher reports being able
  to identify at least one specific question to re-teach or flag for the admin
  per week, attributable to the new drill-down (qualitative success metric
  collected via teacher feedback).

## Assumptions

- The teacher dashboard at `/teacher-dashboard` and its server route
  `/api/teacher-dashboard` already correctly scope data to a teacher's schools
  via `school_teachers` and the legacy `schools.teacher_user_id` column. The
  new endpoints will reuse the same scoping logic verbatim — they will not
  introduce a new permission model.
- The existing `attempts` table is the single source of truth for every metric
  in this feature; no new event collection is required.
- Question stems/options are read from `generated_questions` with fallback to
  `assignment_question_snapshots`, matching how the admin Question Quality view
  already resolves them. The teacher views will use the same lookup.
- The line chart is a time-series visualization built with the project's
  existing `recharts` dependency; no new charting library is added.
- The Standard detail view is rendered as a new route under
  `/teacher-dashboard/standards/[standardId]` (or equivalent), reusing the
  existing dashboard's filter state via URL search params. The Student profile
  view is rendered under `/teacher-dashboard/students/[studentId]`. These paths
  are illustrative; the plan phase will finalize routing.
- Per-question stats for teachers are surfaced through a new read-only
  question detail surface (drawer or dedicated route) reachable from the
  Standard drill-down and the Student profile answer list. The existing
  admin-only `/content/questions` manager remains admin-only and unchanged;
  teachers never land in it.
- The "Sample question" feature reads from the existing question bank
  (`generated_questions` joined to standards). It does **not** generate new
  questions on demand — Gemini integration is out of scope for v1.
- CSV exports follow the existing `src/lib/csv/teacher-dashboard.ts` pattern.
- This feature does not change the admin "Question Quality" page in
  `/content/data-analysis/questions`; that page remains the admin's
  org-wide diagnostic. The new teacher views are intentionally separate to
  avoid coupling teacher and admin concerns.
- "Sample size threshold" for the small-sample indicator on the line chart
  defaults to 10 attempts and is configurable in code, not via UI.
- The mobile/tablet form factor is supported for read-only consumption (as on
  the existing dashboard) but heavy filtering is optimized for desktop, where
  teachers do this analysis.
- **Delivery vehicle**: Per the user's instruction (2026-05-25), the spec
  artifacts and the implementation MUST land in the same pull request
  (`cursor/teacher-question-analytics-ff1f`), not in separate PRs. The
  `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` flow will continue
  to push to this branch and update PR #72 in place.
