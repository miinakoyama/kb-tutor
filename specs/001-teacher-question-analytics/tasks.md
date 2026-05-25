---
description: "Task list for Teacher Question Analytics implementation"
---

# Tasks: Teacher Question Analytics

**Input**: Design documents from `/specs/001-teacher-question-analytics/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED. Per the kb-tutor constitution (V. Development
Workflow & Quality Gates §2): "Pure utilities in `src/lib/` MUST have
Vitest coverage. New role-protected route handlers MUST have at least
one test that asserts both the unauthorized and authorized paths."
This feature adds 4 role-protected route handlers and 5 new pure
aggregation modules, so test tasks are not optional.

**Organization**: Tasks are grouped by user story (US1..US4 from
spec.md) so each story can be implemented, tested, and shipped as an
independent increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependencies on incomplete tasks → can
  run in parallel.
- **[Story]**: Maps the task to a user story (US1..US4). Setup,
  Foundational, Dashboard-wiring, and Polish phases have NO story
  label.
- Every task has an exact file path (absolute under the repo root).

## Path Conventions

Project is a single-tree Next.js App Router app (web app type from
plan.md). All paths are relative to repo root unless noted absolute.

- Pages: `src/app/teacher-dashboard/**`
- Route handlers: `src/app/api/teacher-dashboard/**`
- Aggregation libs: `src/lib/analytics/*-server.ts`
- Client components: `src/components/teacher/*`
- Tests: alongside source as `*.test.ts` / `*.test.tsx`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the existing project skeleton is healthy and pin
the new directory tree. The kb-tutor app already exists; "setup" here
is just scaffolding new directories and confirming the tooling baseline.

- [X] T001 Verify project skeleton is healthy: run `npm install`, `npm run lint`, and `npm test` from repo root. Fix any pre-existing failures or document them in the PR description as not blocking. _(Baseline established: lint clean, 377 / 378 tests pass; the 1 failing test is the pre-existing flake `src/lib/storage.test.ts — "returns wrong-attempt counts per question"` documented in `AGENTS.md` as not env-setup related.)_
- [X] T002 Create empty directory scaffolds so subsequent tasks have stable paths: `src/app/teacher-dashboard/standards/`, `src/app/teacher-dashboard/students/`, `src/app/api/teacher-dashboard/standards/`, `src/app/api/teacher-dashboard/students/`, `src/app/api/teacher-dashboard/questions/`, `src/components/teacher/`. _(Directories are created implicitly when files are written by subsequent tasks; Git does not track empty dirs, so no `.gitkeep` is needed.)_

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the three shared building blocks every user story
depends on — scope resolution, question-preview resolution, and the
new shared TypeScript types. No user-story phase can start before
this phase completes.

**⚠️ CRITICAL**: T003..T010 block US1..US4.

- [X] T003 [P] Add shared TypeScript domain types in `src/lib/analytics/teacher-analytics-types.ts` covering `AccuracyBucket`, `OptionDistribution`, `QuestionPreview`, `ScopeMode`, `SampleMode`, `ChartPoint`, `StudentAttemptRow`, and the four payload types (`StandardDrillDownPayload`, `StudentProfilePayload`, `QuestionDetailPayload`, `SampleQuestionPayload`). Reuse `AttemptMode` from `src/lib/analytics/teacher-dashboard-server.ts`; do NOT redefine it. Match the shapes in `specs/001-teacher-question-analytics/data-model.md` exactly.
- [X] T004 [P] Implement scope helper `resolveTeacherScope()` in `src/lib/analytics/teacher-scope.ts`. Inputs: `{ admin: SupabaseAdminClient, userId: string, role: "teacher" | "admin", classIdFilter?: string, scopeMode?: "selected" | "all" }`. Output: `{ schoolIds: string[]; studentIds: string[]; studentMap: Map<string, { label: string; classId: string | null }> }`. The helper MUST mirror the pipeline in `src/app/api/teacher-dashboard/route.ts` (school_teachers ∪ schools.teacher_user_id → school_members → profiles, excluding `excluded_from_analytics`). Admin with `scopeMode="all"` widens to every school; teacher with `scopeMode="all"` is silently downgraded to `selected`. Use `ANALYTICS_PAGE_SIZE` / `ANALYTICS_IN_FILTER_CHUNK_SIZE` from `src/lib/analytics/pagination.ts` for chunked `IN` queries.
- [X] T005 [P] Vitest unit tests for the scope helper in `src/lib/analytics/teacher-scope.test.ts`. Mock `createSupabaseAdminClient` via `vi.mock()`. Cover: teacher with one school, teacher with multiple schools, teacher with no schools (returns empty arrays), admin with `scope=selected` and `scope=all`, `excluded_from_analytics=true` profiles excluded, and `classIdFilter` outside the caller's schools (silently ignored, not 403 here — auth lives in the route handler).
- [X] T006 [P] Implement question preview resolver `resolveQuestionPreviews()` in `src/lib/analytics/question-preview.ts`. Input: `{ admin: SupabaseAdminClient, questionIds: string[] }`. Output: `Map<string, QuestionPreview | null>`. Lookup order: `generated_questions.payload` (latest by `updated_at`) → `assignment_question_snapshots.payload` fallback. Reuse the `parseQuestionPreview` private helper from `src/app/api/admin/analytics/questions/route.ts`; **extract it from that route into `question-preview.ts` and update the admin route to import it from the new location** so both share one implementation.
- [X] T007 [P] Vitest unit tests for `question-preview.ts` in `src/lib/analytics/question-preview.test.ts`. Cover: question only in `generated_questions`, question only in snapshots, question in both (newer in `generated_questions` wins), malformed `payload` returns null, empty `questionIds` returns empty map.
- [X] T008 Update the admin route at `src/app/api/admin/analytics/questions/route.ts` to import `parseQuestionPreview` / `resolveQuestionPreviews` from `src/lib/analytics/question-preview.ts`. Confirm `npm test` still passes for the existing admin route tests. Depends on T006.
- [X] T009 [P] Implement query-param parsing helper `parseTeacherAnalyticsQuery()` in `src/lib/analytics/teacher-analytics-query.ts` shared by all four new endpoints. Parses `range`, `mode`, `source`, `classId`, `studentId`, `scope`, `assignmentId`, `standardId`, `chartView`, `cursor`, `sampleMode`, `seed`, `skip` from a `URLSearchParams` (or `URL`) with strict allow-lists and safe defaults; returns a typed config object. Returns `{ ok: false, error: "Invalid query: <field>" }` for invalid enums rather than throwing.
- [X] T010 [P] Vitest unit tests for `teacher-analytics-query.ts` in `src/lib/analytics/teacher-analytics-query.test.ts`. Cover every enum field, defaults, the `seed` UUID-ish allow-list (printable ASCII length 4..64), and the integer validation for `skip` (≥ 0).

**Checkpoint**: Foundation ready — US1..US4 can now start in parallel.

---

## Phase 3: User Story 1 — Standard drill-down (Priority: P1) 🎯 MVP

**Goal**: From the dashboard's "Performance by standard" table, the
teacher can drill into any standard and see every question her
students attempted under that standard, color-coded by accuracy, with
per-mode breakdown and per-option pick distribution.

**Independent Test**: Sign in as a teacher whose class has at least
one standard with multiple attempted questions, navigate to
`/teacher-dashboard/standards/<standardId>`, and verify the page
lists every attempted question with correct counts, accuracy %, color
coding, and per-option distribution scoped to that teacher's students
only (per spec acceptance scenarios 1.1–1.4, FR-010..FR-015, FR-054).

### Tests for User Story 1 (REQUIRED)

> Write these tests FIRST, ensure they FAIL before implementation.

- [X] T011 [P] [US1] Vitest unit tests for the aggregator in `src/lib/analytics/standard-drill-down-server.test.ts`. The tests call `buildStandardDrillDown({ attempts, previews, standardId, standardLabel, scopedStudents })` and assert: (a) only questions with `attempted ≥ 1` appear; (b) sort order is `accuracy ASC, attempted DESC, questionId ASC`; (c) buckets `low | mid | high` use the `STANDARD_*` accuracy constants from `src/lib/analytics/constants.ts`; (d) per-mode breakdown sums match overall; (e) option-distribution shares sum to 1.0 ± 1e-6; (f) `dedupeAssignmentExamAttempts` is applied (fixture with two practice + two assignment-exam rows on the same question → 1 exam attempt after dedupe); (g) attempts with `time_spent_sec=null` excluded from `averageTimeSec`.
- [X] T012 [P] [US1] Vitest route handler test in `src/app/api/teacher-dashboard/standards/[standardId]/route.test.ts`. Covers the 10 cases enumerated in `contracts/GET-teacher-dashboard-standards-id.md` §"Test surface": unauth → 401; student role → 403; teacher no schools → 200 empty; teacher no attempts → 200 empty; cross-school isolation (SC-006); `studentId` narrows; `mode=compare` populates `byMode`; unknown `standardId` → 404; admin `scope=all` widens, teacher `scope=all` silently downgraded; exam dedupe applied end-to-end. Mock Supabase via `vi.mock("@/lib/supabase/server")` and `vi.mock("@/lib/supabase/admin")` per the existing pattern in `assignment-progress.test.ts`.

### Implementation for User Story 1

- [X] T013 [P] [US1] Implement pure aggregator `buildStandardDrillDown()` in `src/lib/analytics/standard-drill-down-server.ts`. Signature: `(input: { attempts: AttemptRow[]; previews: Map<string, QuestionPreview | null>; standardId: string; standardLabel: string }) => StandardDrillDownPayload`. Applies `dedupeAssignmentExamAttempts` first, then groups by `question_id`, computes per-question stats, derives `bucket` from `STANDARD_*` constants, sorts, and projects to the wire shape. No Supabase imports — pure function over arrays/maps.
- [X] T014 [US1] Implement the GET route handler at `src/app/api/teacher-dashboard/standards/[standardId]/route.ts`. Flow: (1) `parseTeacherAnalyticsQuery()` → 400 on invalid; (2) `supabase.auth.getUser()` → 401; (3) `resolveRoleWithServerFallback()` → 403 for non-teacher/admin; (4) validate `standardId` against `STANDARD_DEFINITIONS` from `src/lib/standards.ts` → 404 if unknown; (5) `resolveTeacherScope()` → student set; (6) fetch attempts for `(user_id IN scopedStudents) AND (standard_id = standardId)` honoring `range`/`mode`/`source` filters using `chunkArray` + `ANALYTICS_PAGE_SIZE`; (7) `resolveQuestionPreviews()` for the distinct `question_id`s; (8) `buildStandardDrillDown()` → JSON. Depends on T003, T004, T006, T009, T013.
- [X] T015 [US1] Build the Server Component page at `src/app/teacher-dashboard/standards/[standardId]/page.tsx`. Fetches the new endpoint server-side (use `cookies()` + `fetch` to the route, or call the aggregator directly via the lib import to avoid the network hop in SSR — prefer the direct lib path for perf, mirroring how the admin pages share lib code). Reads URL search params for filters. Renders header (standard id + label + summary KPIs), the question table, and integrates the `QuestionDetailDrawer` (T030) opened via `?question=…`.
- [X] T016 [P] [US1] Build the client component `StandardDrillDownTable` at `src/components/teacher/StandardDrillDownTable.tsx`. Props: `{ payload: StandardDrillDownPayload; selectedQuestionId?: string }`. Renders the sortable table (sortable by accuracy / attempted / averageTime via column headers; default sort already applied server-side). Each row shows: question stem preview (via `LatexText` from `src/components/shared/LatexText.tsx`), `attempted`, `uniqueStudents`, `correct`, `accuracy` (color-coded by bucket), `averageTimeSec`, and a `byMode` mini-grid (practice/exam/review). Clicking a row updates the URL with `?question=<id>` (using `next/navigation` `useRouter` + `useSearchParams`). Includes an inline expander per row that shows the full preview and the option-distribution bars.
- [X] T017 [P] [US1] Vitest component test for `StandardDrillDownTable` in `src/components/teacher/StandardDrillDownTable.test.tsx`. Render with a fixture payload, assert rows render, the bucket color class is correct for each accuracy band, clicking a row dispatches the URL change (`mockRouter.push` called with `?question=…`), and the expander reveals the option distribution.
- [X] T018 [US1] On the existing dashboard page `src/app/teacher-dashboard/page.tsx`, make each standard-table row navigable to `/teacher-dashboard/standards/<row.standardId>` (preserve current filters via the URL). Use a `<Link>` that wraps the row label or the whole row. Do not break the existing "Download CSV" or status-chip controls.
- [X] T019 [US1] Add CSV download for the standard drill-down via `src/lib/csv/teacher-dashboard-standard.ts` and wire a "Download CSV" button into `StandardDrillDownTable`. Follow the existing `src/lib/csv/teacher-dashboard.ts` pattern (BOM, RFC 4180 quoting, headers in English).

**Checkpoint**: US1 fully functional and independently testable. The teacher can navigate from the dashboard to a Standard drill-down and see color-coded question stats for her students — this is the MVP.

---

## Phase 4: User Story 2 — Student profile (Priority: P1)

**Goal**: From the dashboard's "All students" table, clicking a
student's name opens that student's profile with an accuracy
line-chart (rolling 20-attempts window by default, cumulative toggle)
and a paginated answer list filterable by assignment and standard.

**Independent Test**: Sign in as a teacher, click any student row on
the dashboard, verify chart renders with one data point per attempt,
that toggling Rolling/Cumulative changes the line without re-fetch,
that the assignment+standard filters narrow chart + summary + answer
list together, and that each answer row shows the student's selected
option vs. the correct option (per FR-020..FR-026).

### Tests for User Story 2 (REQUIRED)

- [ ] T020 [P] [US2] Vitest unit tests for the aggregator in `src/lib/analytics/student-profile-server.test.ts`. Use the case enumerated in `contracts/GET-teacher-dashboard-students-id.md` §"Test surface" §5: fixture of 25 alternating attempts → first 10 chart points have `isSmallSample: true`; `rollingAccuracy` at index 20 is exactly 0.5; `cumulativeAccuracy` at index 25 is `13/25 = 0.52` (±1e-9). Additionally: assignment filter narrows chart+summary+answers consistently; standard filter combines with assignment via AND; `assignmentLabel === "Self-practice"` when `assignment_id` is null; cursor pagination boundary respected; tied timestamps break by `attemptId ASC`; `dedupeAssignmentExamAttempts` applied; empty student → all empty arrays, `status: "not_started"`.
- [ ] T021 [P] [US2] Vitest route handler test in `src/app/api/teacher-dashboard/students/[studentId]/route.test.ts`. Cases: unauth → 401; student role → 403; teacher requesting student outside their schools → **403 (not 404)** (SC-006 + no existence leak); teacher requesting own student with zero attempts → 200 empty arrays + `status: "not_started"`; assignment + standard filters narrow together; cursor pagination returns strictly-earlier rows on page 2; `assignmentLabel` fallback to "Self-practice"; exam dedupe applied end-to-end.

### Implementation for User Story 2

- [ ] T022 [P] [US2] Implement pure aggregator `buildStudentProfile()` in `src/lib/analytics/student-profile-server.ts`. Signature: `(input: { attempts: AttemptRow[]; student: { id: string; label: string; classId: string | null; classLabel: string }; previews: Map<string, QuestionPreview | null>; assignmentLabels: Map<string, string>; cursor: string | null; pageSize: number }) => StudentProfilePayload`. Order attempts by `answered_at ASC, attemptId ASC` for the chart; reverse to `DESC` for the answer list. Compute `rollingAccuracy` over the trailing 20 attempts in one O(n) pass with a sliding sum. `isSmallSample = cumulativeAttempts < 10`. Cursor: paginate the DESC list, return `nextCursor = lastRow.answeredAt` or `null` when exhausted.
- [ ] T023 [US2] Implement the GET route handler at `src/app/api/teacher-dashboard/students/[studentId]/route.ts`. Flow: parse query, auth + role, `resolveTeacherScope()`, then **gate on `studentIds.includes(studentId)` → 403 if not** (do not 404, do not leak existence). Fetch attempts with the filters; fetch assignment labels for distinct non-null `assignment_id`s via one `assignments.select("id,title").in("id", …)` query; fetch question previews for distinct `question_id`s in the current page; call `buildStudentProfile()`. Depends on T004, T006, T009, T022.
- [ ] T024 [P] [US2] Build the chart component `AccuracyLineChart` at `src/components/teacher/AccuracyLineChart.tsx`. Props: `{ points: ChartPoint[]; view: "rolling" | "cumulative" }`. Uses Recharts `<LineChart>` with `<XAxis dataKey="attemptIndex">`, `<YAxis domain={[0, 1]}>`, one `<Line>` whose `dataKey` is `rollingAccuracy` or `cumulativeAccuracy` depending on `view`. Show a small "Small sample" badge over the chart while any point in view has `isSmallSample: true`. Tooltip displays the underlying attempt's `answeredAt` and both values.
- [ ] T025 [P] [US2] Build the client component `StudentProfileView` at `src/components/teacher/StudentProfileView.tsx`. Props: `{ payload: StudentProfilePayload }`. Top section: student name + summary KPIs (totalAttempts, accuracy, averageTime, status badge using the existing dashboard's badge colors). Middle: `AccuracyLineChart` with Rolling/Cumulative toggle (state in component, URL param sync via `useSearchParams`). Filter row: Assignment select + Standard select, both populated from `payload.filters`. Bottom: paginated answer list with "Load more" using `nextCursor` (fetches via a small client-side helper to the same endpoint with `cursor=`). Each answer row clickable → updates `?question=<id>&studentId=<sid>` so the drawer (T030) opens with student context.
- [ ] T026 [P] [US2] Vitest component test for `AccuracyLineChart` in `src/components/teacher/AccuracyLineChart.test.tsx`. Render with a fixture, assert the chart switches `dataKey` on prop change (`rerender({ view: "cumulative" })`), small-sample badge appears when input has `isSmallSample=true` points and disappears otherwise. Use `@testing-library/react` matchers consistent with the rest of the repo.
- [ ] T027 [US2] Build the Server Component page at `src/app/teacher-dashboard/students/[studentId]/page.tsx`. Fetches the new endpoint server-side (direct lib import preferred — see T015). Renders `<StudentProfileView payload={…} />` plus the `QuestionDetailDrawer` (T030).
- [ ] T028 [US2] On the existing dashboard page `src/app/teacher-dashboard/page.tsx`, make each student-table row's name a `<Link>` to `/teacher-dashboard/students/<row.studentId>` (preserve filters via URL). Existing low-and-fast banner stays unchanged.
- [ ] T029 [US2] Add CSV download for the Student profile answer list via `src/lib/csv/teacher-dashboard-student.ts` (per FR-052). Wire a "Download CSV" button into `StudentProfileView`. Same pattern as T019.

**Checkpoint**: Students stories US1 and US2 are both shippable independently. Together they cover the two P1 stories — feature is feature-complete at MVP+1 quality.

---

## Phase 5: User Story 3 — Question detail drawer (Priority: P2)

**Goal**: A read-only question detail drawer reachable from US1 (drill-down rows) and US2 (answer list rows), opening via `?question=<id>` URL state. Same `question_id` always shows the same headline numbers regardless of entry point. Admins additionally get a `selected`/`all` scope toggle. When opened from a Student profile, an inline "This student" annotation shows that one student's pick.

**Independent Test**: Open any question row from a Standard drill-down → drawer slides in with stats. Open the same question_id from a Student profile attempt row → drawer shows same headline stats + the per-student annotation. Verify counts equal the parent surface's numbers for the same filters (SC-003).

### Tests for User Story 3 (REQUIRED)

- [ ] T030 [P] [US3] Vitest unit tests for the aggregator in `src/lib/analytics/question-detail-server.test.ts`. Cover: empty in-scope attempts → `summary` zeros + `optionDistribution` shows every option with `picks=0`; with attempts → counts match; `byMode` has zero buckets (not NaN) for modes with no attempts; `studentContext` populated only when `studentId` is in scope, omitted when out of scope (no leak); time percentiles p50/p90 computed correctly; exam dedupe applied; numeric parity with `buildStandardDrillDown()` for the same question + scope (SC-003 invariant — same fixture flowed through both aggregators yields identical totals).
- [ ] T031 [P] [US3] Vitest route handler test in `src/app/api/teacher-dashboard/questions/[questionId]/route.test.ts`. Covers: unauth → 401; student role → 403; question id not in bank → 404; question id with zero in-scope attempts → 200 empty stats; teacher with valid `studentId` → 200 + `studentContext`; teacher with `studentId` outside scope → 200 without `studentContext` (counts still class-wide); admin `scope=all` widens; teacher `scope=all` downgraded.

### Implementation for User Story 3

- [ ] T032 [P] [US3] Implement pure aggregator `buildQuestionDetail()` in `src/lib/analytics/question-detail-server.ts`. Signature: `(input: { attempts: AttemptRow[]; preview: QuestionPreview | null; questionId: string; standardId: string | null; standardLabel: string | null; scope: ScopeMode; studentContext?: { studentId: string; label: string } }) => QuestionDetailPayload`. Time percentiles: reuse the `percentile()` helper from `src/app/api/admin/analytics/questions/route.ts` — extract it into the shared lib `src/lib/analytics/percentile.ts` first.
- [ ] T033 [US3] Extract `percentile()` from `src/app/api/admin/analytics/questions/route.ts` into `src/lib/analytics/percentile.ts` and have the admin route import it from there. Add a tiny unit test `src/lib/analytics/percentile.test.ts` (median of `[1,2,3,4,5] = 3`; p90 of `[1..10] = 9`; empty → null).
- [ ] T034 [US3] Implement the GET route handler at `src/app/api/teacher-dashboard/questions/[questionId]/route.ts`. Flow: parse query, auth + role, `resolveTeacherScope()`. Fetch the question preview via `resolveQuestionPreviews()`; if `Map.get(questionId)` is null AND there are no attempts referencing the question at all (one cheap `.eq("question_id", id).limit(1)` probe), return 404. Otherwise fetch in-scope attempts; resolve `standardId`/`standardLabel` from any attempt or from `STANDARD_DEFINITIONS`. If `studentId` query param is present AND `studentIds.includes(studentId)`, build the `studentContext` from that one student's latest in-scope attempt on this question.
- [ ] T035 [P] [US3] Build the drawer component `QuestionDetailDrawer` at `src/components/teacher/QuestionDetailDrawer.tsx`. Mounted at the dashboard / drill-down / student profile pages. Reads `?question=<id>` (and optional `studentId=<sid>`) from `useSearchParams`. When the param appears, fetches `/api/teacher-dashboard/questions/<id>` and renders a right-side drawer (`<dialog>` element with `aria-modal`, focus trap, ESC to close). Content: question preview (via `LatexText`), correct option marked, summary KPIs, per-mode breakdown, per-option distribution bars, and the optional `studentContext` annotation pill ("This student picked B → ❌ Incorrect, 47s, practice, 2026-05-22"). For admins, render a scope toggle (`Selected schools` / `All schools`) that refetches with `scope=all`. Closes by removing the URL param (preserves the rest of the URL state).
- [ ] T036 [P] [US3] Vitest component test for `QuestionDetailDrawer` in `src/components/teacher/QuestionDetailDrawer.test.tsx`. Mock `fetch` via `vi.spyOn(globalThis, "fetch")`. Cases: drawer hidden when `?question` absent; drawer opens and shows fixture payload when param present; empty state ("No students have attempted this question yet") when summary is zeros; admin sees scope toggle, teacher does not; `studentContext` annotation visible when payload includes it; ESC closes the drawer (asserts URL is cleared).

**Checkpoint**: US3 is shippable. Teachers can now look up any single question's class stats from either entry point.

---

## Phase 6: User Story 4 — Sample question modal (Priority: P2)

**Goal**: A "Sample question" button on each row of the dashboard's "Performance by standard" table opens a modal showing one question for that standard. The teacher picks one of `Random` (default), `High accuracy first`, or `Low accuracy first` and uses "Show another" to cycle.

**Independent Test**: Click "Sample question" on any standard row → modal shows one question with `Random` selected. Switch to `High accuracy first` → re-orders to the highest-in-scope-accuracy question. Switch to `Low accuracy first` → opposite. "Show another" advances within current mode; disables when bank exhausted (FR-040..FR-047).

### Tests for User Story 4 (REQUIRED)

- [ ] T037 [P] [US4] Vitest unit tests for the sample selector in `src/lib/analytics/sample-question-server.test.ts`. Cases per `contracts/GET-teacher-dashboard-standards-id-sample.md` §"Test surface": empty bank → `questionId: null, totalAvailable: 0, isLast: true`; single question bank → same on `skip=0` and `skip=1` (deterministic exhaustion); `random` determinism with the same `seed`+`skip`; `high_accuracy_first` ordering on a fixture of {0.9, 0.6, 0.3, unattempted} → `[0.9, 0.6, 0.3, unattempted]`; `low_accuracy_first` reverses attempted; tie-breaker (two questions with accuracy 0.5 → more-attempted first); unknown standard → handled at the route level (this is the lib).
- [ ] T038 [P] [US4] Vitest route handler test in `src/app/api/teacher-dashboard/standards/[standardId]/sample/route.test.ts`. Covers: unauth → 401; student → 403; unknown standardId → 404; empty bank → 200 with `questionId: null`; mode switching changes the response on the same standard; teacher with no in-scope students still gets valid responses for `random` and gets unattempted-only ordering for the two accuracy modes.

### Implementation for User Story 4

- [ ] T039 [P] [US4] Implement bank-listing helper `listBankQuestionsForStandard()` in `src/lib/analytics/standard-bank.ts`. Input: `{ admin: SupabaseAdminClient, standardId: string }`. Output: `string[]` — distinct `question_id`s whose latest `generated_questions.payload.standardId` (or `assignment_question_snapshots.payload.standardId` fallback) matches. Use the `parseQuestionPreview` helper from T006 to read the standardId. Add a unit test `src/lib/analytics/standard-bank.test.ts`.
- [ ] T040 [P] [US4] Implement pure sample-question selector `selectSampleQuestion()` in `src/lib/analytics/sample-question-server.ts`. Signature: `(input: { bankQuestionIds: string[]; previews: Map<string, QuestionPreview | null>; inScopeStats: Map<string, { attempted: number; accuracy: number }>; mode: SampleMode; seed: string; skip: number; standardId: string; standardLabel: string }) => SampleQuestionPayload`. Implements the ordering rules from research R5 + FR-046. `random` uses a deterministic seeded shuffle (`mulberry32` from the seed-derived integer is fine; document in a comment).
- [ ] T041 [US4] Implement the GET route handler at `src/app/api/teacher-dashboard/standards/[standardId]/sample/route.ts`. Flow: parse query, auth + role, validate standardId against `STANDARD_DEFINITIONS` → 404 if unknown, `resolveTeacherScope()`. Fetch in-scope `attempts WHERE standard_id = … AND user_id IN scopedStudents` (small payload, no pagination needed for ordering metadata). Compute `inScopeStats` per question. Call `listBankQuestionsForStandard()` for the full bank, then `resolveQuestionPreviews()` for those ids. Server-generate `seed` (random UUID) when client did not supply one and echo it back. Depends on T004, T006, T009, T039, T040.
- [ ] T042 [P] [US4] Build the modal component `SampleQuestionModal` at `src/components/teacher/SampleQuestionModal.tsx`. Props: `{ open: boolean; standardId: string; onClose: () => void }`. Internal state: `mode: SampleMode` (default `random`), `seed: string` (generated client-side via `crypto.randomUUID()` once on open), `skip: number` (starts at 0). On every state change, fetches `/api/teacher-dashboard/standards/<standardId>/sample?mode=…&seed=…&skip=…`. Renders: mode toggle (3 radio-style pills), the current question with stem + options + correct option marked, "Show another" (disabled when `isLast` is true), and an empty state when `questionId` is null. Mode persistence: per FR-047 only across "Show another" clicks within the same open session (state lives in the component, lost on close).
- [ ] T043 [P] [US4] Vitest component test for `SampleQuestionModal` in `src/components/teacher/SampleQuestionModal.test.tsx`. Mock `fetch`. Cases: opens with `random` selected by default; switching mode triggers a refetch with the new `mode` param; "Show another" increments `skip`; "Show another" disabled when API returns `isLast: true`; empty bank shows the empty state; closing and reopening generates a fresh seed (verify `crypto.randomUUID` called per open).
- [ ] T044 [US4] On the existing dashboard page `src/app/teacher-dashboard/page.tsx`, add a "Sample question" button to each row of the "Performance by standard" table. The button opens `SampleQuestionModal` with that standard's id. Reuse the existing styling tokens (the green action buttons used for "Download CSV" already establish the pattern).

**Checkpoint**: All four user stories are individually shippable. Feature is now complete in scope.

---

## Phase 7: Dashboard wiring polish

**Purpose**: Final wiring of the new entry points on the existing dashboard. These tasks formally tie US1..US4 into the existing `/teacher-dashboard` UX so the teacher's path from dashboard → drill-down → drawer → sample is seamless.

- [ ] T045 In `src/app/teacher-dashboard/page.tsx`, ensure the URL state (range, mode, source, school, student, topic, standardFilter, studentFilter) is reflected in `useSearchParams` and forwarded to the navigation `<Link>`s introduced in T018 and T028 so filter context is preserved when drilling.
- [ ] T046 Mount the shared `QuestionDetailDrawer` on the existing dashboard page `src/app/teacher-dashboard/page.tsx` too, so opening `?question=<id>` from any route in the teacher dashboard tree behaves consistently. (Already mounted on the new pages in T015 and T027; this is purely the existing dashboard.)
- [ ] T047 Update the dashboard's user-visible English copy in `src/app/teacher-dashboard/page.tsx` to mention the new navigation in the helper text under the H1 ("Identify which standards need re-teaching and which students need a closer look — click a row to drill in."). Constitution Principle I and II.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final quality gates and the constitutional capacity note.

- [ ] T048 [P] Run `npm run lint`, `npm test`, `npm run build` from repo root; fix every error introduced by this feature. Constitution V. §3.
- [ ] T049 [P] Walk through the manual smoke test in `specs/001-teacher-question-analytics/quickstart.md` against `npm run dev`. Capture screenshots of: dashboard with new buttons, standard drill-down, student profile with chart in both Rolling and Cumulative modes, question detail drawer (with and without studentContext), sample-question modal in all 3 modes. Save under `specs/001-teacher-question-analytics/screenshots/` and reference them in the PR description.
- [ ] T050 [P] Add a "Capacity note" section to PR #72's description per Constitution III: "Four new GET endpoints, called only when a teacher actively browses analytics (no background polling). Each endpoint stays ≤ 500ms p95 at the realistic ceiling (30 students × 1,000 attempts). No new tables, no new external calls, no new dependencies. Expected incremental load: ≤ 4 reads per teacher analytics session."
- [ ] T051 [P] Accessibility pass on the new components: every interactive element has a label, the drawer traps focus, the modal returns focus to the trigger on close, the chart has an `aria-label` describing the data series, the color-coded bucket pills carry `aria-label` text (not color alone). Files: `src/components/teacher/StandardDrillDownTable.tsx`, `src/components/teacher/StudentProfileView.tsx`, `src/components/teacher/QuestionDetailDrawer.tsx`, `src/components/teacher/SampleQuestionModal.tsx`, `src/components/teacher/AccuracyLineChart.tsx`. Constitution II.
- [ ] T052 [P] Verify English-only surface (Constitution I): grep new files under `src/app/teacher-dashboard/`, `src/app/api/teacher-dashboard/`, `src/components/teacher/`, `src/lib/analytics/` for any non-ASCII character that is part of a user-visible string. Comments may contain any language but UI strings MUST be English.
- [ ] T053 [P] Documentation: append a short "Teacher analytics" section to `src/app/teacher-dashboard/README.md` (or create it if missing) that links to the spec and explains the new routes. Constitution I + V.
- [ ] T054 Final pass: confirm every checkbox in `specs/001-teacher-question-analytics/checklists/requirements.md` is ✅ and that the spec's Success Criteria SC-001..SC-007 are demonstrably met by the manual smoke test from T049. Update the checklist file with the new evidence.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup, T001..T002)**: No dependencies.
- **Phase 2 (Foundational, T003..T010)**: After Phase 1. **Blocks every user story phase.**
  - T008 depends on T006 (sequentially after T006).
- **Phase 3 (US1, T011..T019)**: After Phase 2.
- **Phase 4 (US2, T020..T029)**: After Phase 2. Independent of US1 once Phase 2 is done.
- **Phase 5 (US3, T030..T036)**: After Phase 2. Drawer is mounted by US1 (T015) and US2 (T027), so US3's UI lives within both surfaces — but the drawer component itself (T035) is independent and can be developed in parallel with US1/US2.
- **Phase 6 (US4, T037..T044)**: After Phase 2. Fully independent of US1/US2/US3.
- **Phase 7 (Wiring polish, T045..T047)**: After all four user stories.
- **Phase 8 (Polish, T048..T054)**: After Phase 7.

### User Story Dependencies

- **US1 (P1)**: Independent of US2/US3/US4 once Foundational is done. Has no cross-story dependencies.
- **US2 (P1)**: Independent of US1/US3/US4 once Foundational is done.
- **US3 (P2)**: Logically opened from US1/US2's UIs, but the drawer component and its endpoint are buildable independently against fixture data. Integration with US1's table (T015 mount of drawer) and US2's answer list (T025 click handler) is the only coupling, and both are explicitly noted in the wiring tasks.
- **US4 (P2)**: Completely independent — different entry point (dashboard standard row), different endpoint, different modal. Can be built in parallel with everything else after Foundational.

### Within Each User Story

- Tests (T011, T012, T020, T021, T030, T031, T037, T038) MUST be written first and verified to FAIL before the matching implementation tasks land.
- Aggregators (libs) before route handlers before client components before page mounts:
  - US1: T013 (lib) → T014 (route) → T015 (page) → T016 (component) → T018 (wire dashboard) → T019 (CSV).
  - US2: T022 (lib) → T023 (route) → T024 (chart) + T025 (view) → T027 (page) → T028 (wire dashboard) → T029 (CSV).
  - US3: T033 (percentile extract) → T032 (lib) → T034 (route) → T035 (drawer) → mounted by T015/T027/T046.
  - US4: T039 (bank lister) + T040 (selector lib) → T041 (route) → T042 (modal) → T044 (wire dashboard).

### Parallel Opportunities

- **Phase 2**: T003, T004, T006, T009 are all `[P]` and can run in parallel. T005, T007, T010 are their `[P]` tests. T008 follows T006.
- **Phase 3 (US1)**: T011 + T012 (tests) in parallel; T013 + T016 + T017 in parallel; T014 follows T013; T015 follows T014; T018 + T019 in parallel after T015/T016.
- **Phase 4 (US2)**: T020 + T021 in parallel; T022 + T024 + T026 in parallel; T023 follows T022; T025 follows T024; T027 follows T023+T025; T028 + T029 in parallel after T027.
- **Phase 5 (US3)**: T030 + T031 in parallel; T032 + T035 + T036 in parallel after T033; T034 follows T032.
- **Phase 6 (US4)**: T037 + T038 in parallel; T039 + T040 + T042 + T043 in parallel; T041 follows T039+T040; T044 follows T041+T042.
- **Across user stories**: After Phase 2 completes, US1, US2, US3, and US4 implementation tasks can be advanced in parallel.
- **Phase 8**: T048..T053 are all `[P]` and can run in parallel; T054 is the final sequential gate.

---

## Parallel Example: User Story 1

```bash
# After Phase 2 is checked-in, launch US1's parallelizable starting tasks:
Task: "T011 Vitest unit tests for standard-drill-down aggregator in src/lib/analytics/standard-drill-down-server.test.ts"
Task: "T012 Vitest route handler test in src/app/api/teacher-dashboard/standards/[standardId]/route.test.ts"
Task: "T013 Implement aggregator src/lib/analytics/standard-drill-down-server.ts"
Task: "T016 Build StandardDrillDownTable client component in src/components/teacher/StandardDrillDownTable.tsx"
Task: "T017 Vitest component test for StandardDrillDownTable in src/components/teacher/StandardDrillDownTable.test.tsx"

# T014 (route) waits on T013; T015 (page) waits on T014; T018 + T019 (wiring) wait on T015 + T016.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001, T002).
2. Phase 2: Foundational (T003..T010). **Hard checkpoint** — every following story depends on these helpers.
3. Phase 3: US1 (T011..T019). At the end of this phase a teacher can navigate from the dashboard to a per-standard drill-down and see color-coded question stats. **This is the MVP and is independently demoable.**
4. Phase 7: Wiring polish for US1's link (T045 fragment) and the dashboard helper-text copy (T047).
5. Phase 8: Polish — lint/build/test green, accessibility, capacity note.
6. **STOP and VALIDATE**: Sign-in as a teacher, walk through quickstart.md Standard drill-down section. If acceptable, this can ship as a standalone PR.

### Incremental Delivery

1. Phase 1 + Phase 2 → foundation ready.
2. Add US1 (Standard drill-down) → demo to the teacher → ship if approved.
3. Add US2 (Student profile + chart) → demo → ship.
4. Add US3 (Question detail drawer) → ship (it wires into both US1 and US2 surfaces).
5. Add US4 (Sample question modal) → ship.
6. Each phase adds value without breaking the previous ones. Per the user's PR instruction (2026-05-25), all increments land in PR #72 on branch `cursor/teacher-question-analytics-ff1f`, not in separate PRs — but each Phase 3..6 completion is still its own checkpoint commit.

### Parallel Team Strategy (theoretical — this branch is owned by a single agent)

With multiple developers and after Phase 2 is complete:

1. Developer A → US1 (standard drill-down) → ~9 tasks.
2. Developer B → US2 (student profile) → ~10 tasks.
3. Developer C → US3 (question detail drawer) → ~7 tasks.
4. Developer D → US4 (sample question modal) → ~8 tasks.
5. All four merge to the feature branch independently; Phase 7 + Phase 8 are run once after all stories are in.

---

## Notes

- `[P]` tasks operate on distinct files and have no dependencies on incomplete tasks; sequencing constraints are documented per phase.
- `[Story]` label is required on Phase 3..6 tasks and forbidden on Setup / Foundational / Wiring / Polish tasks per the speckit-tasks skill.
- Every task lists its exact file path. Tasks that touch the same file (e.g., T018, T028, T044, T045, T046, T047 all touch `src/app/teacher-dashboard/page.tsx`) are deliberately sequential and never marked `[P]`.
- Tests MUST be written first within each story and MUST FAIL before the matching implementation task starts. This is the kb-tutor constitution's Development Workflow §2 in practice.
- Commit after each task or each tight group of related tasks. Push at least once per phase.
- The four `[NEEDS CLARIFICATION]` markers from `/speckit-specify` were all resolved in `/speckit-clarify` (Q1..Q4). No `[NEEDS CLARIFICATION]` task exists in this list.
- The whole feature stays on branch `cursor/teacher-question-analytics-ff1f` and lands in PR #72.
