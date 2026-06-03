# Implementation Plan: Teacher Question Analytics

**Branch**: `cursor/teacher-question-analytics-ff1f` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-teacher-question-analytics/spec.md`

## Summary

Give teachers a question-level analytics layer on top of the existing
Teacher Dashboard. Four user-visible surfaces are added:

1. **Standard drill-down** (`/teacher-dashboard/standards/[standardId]`)
   listing every question the teacher's students have attempted under that
   standard, color-coded by accuracy.
2. **Student profile** (`/teacher-dashboard/students/[studentId]`) with an
   accuracy-over-time line chart (default: rolling window of the last 20
   attempts; cumulative toggle) and a paginated answer list filterable by
   assignment and standard.
3. **Question detail drawer** (read-only) reachable from both surfaces. Same
   `question_id` always renders the same primary numbers regardless of entry
   point. Admins additionally get a "Selected schools" vs "All schools" scope
   toggle.
4. **Sample question modal** on the dashboard's "Performance by standard"
   table. Teacher chooses one of `Random` / `High accuracy first` /
   `Low accuracy first`. `Random` is the default.

The technical approach reuses the existing teacher-dashboard scoping
pipeline (`school_teachers` ∪ `schools.teacher_user_id` → students →
`attempts` rows), the existing exam-attempt deduper
(`dedupeAssignmentExamAttempts`), the existing question-preview resolver
(`generated_questions` → `assignment_question_snapshots` fallback), and the
existing analytics pagination helpers. No new database tables, RPCs, or
migrations are required. Two server-only aggregation modules are added under
`src/lib/analytics/`, three new GET route handlers are added under
`/api/teacher-dashboard/...`, and three new client pages plus one drawer
component are added under `src/app/teacher-dashboard/` and
`src/components/`.

## Technical Context

**Language/Version**: TypeScript on Next.js 16 (App Router) + React 19. Node.js 22.x.

**Primary Dependencies**: `@supabase/ssr`, `@supabase/supabase-js`,
`recharts` (for the accuracy line chart — already a dependency, currently
unused in `/teacher-dashboard`), `lucide-react`, `react-katex` (for math in
question previews), Tailwind CSS v4. No new packages.

**Storage**: Supabase Postgres. **Read-only** for this feature: queries hit
`attempts`, `profiles`, `school_members`, `school_teachers`, `schools`,
`generated_questions`, `assignment_question_snapshots`. **No new tables, no
new migrations, no schema changes.** Existing indexes are sufficient (see
`research.md` for verification of which indexes back the hot paths).

**Testing**: Vitest + jsdom. Pure aggregation modules in
`src/lib/analytics/` get unit tests next to the source as `*.test.ts`. Each
new route handler gets at least one test asserting (a) unauthorized → 401,
(b) student role → 403, (c) teacher with no class → empty payload,
(d) teacher with attempts → expected aggregates. Supabase clients are mocked
via `vi.mock("@/lib/supabase/server")` and `vi.mock("@/lib/supabase/admin")`
following the existing pattern in `assignment-progress.test.ts`.

**Target Platform**: Browser (teacher's Chromebook or laptop) + Vercel-style
Node.js function runtime for the API routes. Read-only, no streaming, no
edge runtime; standard Node runtime keeps us consistent with the existing
`/api/teacher-dashboard` handler and with the constitution's Performance
Goals.

**Project Type**: Web application (Next.js App Router monorepo-of-one).
Single `src/` tree, no separate frontend/backend split — pages, route
handlers, and lib utilities all live under `src/`.

**Performance Goals**: Per the constitution: p95 server response ≤ 500ms,
p95 page-interactive ≤ 3s on Chromebook. Concretely for this feature:

- Standard drill-down endpoint MUST return for a class of 30 students with
  up to 1,000 attempts in scope in ≤ 500ms p95. Achieved by reusing the
  existing chunked `IN` pagination in `src/lib/analytics/pagination.ts`
  with `ANALYTICS_PAGE_SIZE` and `ANALYTICS_IN_FILTER_CHUNK_SIZE`.
- Student profile endpoint MUST return ≤ 500ms p95 for a single student
  with up to 1,000 attempts (the realistic ceiling per the spec's SC-002).
- Question detail endpoint MUST return ≤ 300ms p95 for a single question
  scoped to ≤ 30 students.
- Sample question endpoint MUST return ≤ 250ms p95 (one question stem +
  ordering metadata). Achieved by sorting the in-scope summary already
  built for the standard drill-down rather than re-scanning the bank.

**Constraints**:

- No new external dependencies; recharts is reused.
- All `localStorage` writes guarded with `typeof window !== "undefined"`.
- All route handlers re-verify the user via `supabase.auth.getUser()` and
  re-resolve the role via `resolveRoleWithServerFallback()`. Middleware
  alone is not sufficient (Constitution V).
- All user-facing strings in English (Constitution I).
- No `dangerouslySetInnerHTML` — question stems / options rendered with
  `<LatexText>` (Constitution II).
- No `any`. `unknown` with type guards where the type is genuinely
  uncertain (Constitution Technical Standards).
- All data fetching from Server Components where possible; client-side
  only for interactive filters, drawers, and the chart.

**Scale/Scope**: ~6 new files under `src/lib/analytics/`, ~4 new route
handler files, ~5 new client component / page files, ~3 new server lib
files. Roughly 2,500 lines net (rough estimate). 0 migrations, 0 SQL views,
0 RPCs.

## Constitution Check

Mapped against `.specify/memory/constitution.md` v1.1.0:

### Principle I — English-Only Product Surface

| Item | Status | Notes |
|---|---|---|
| User-facing UI strings English | ✅ Plan | Spec already mandates English. Implementation will follow. |
| Code comments English | ✅ Plan | Existing repo convention. |
| Spec / plan / tasks in English | ✅ Done | spec.md and this plan.md are English. |
| Commit messages / PR titles English | ✅ Plan | Confirmed by existing PR #72. |

**Gate**: PASS.

### Principle II — Intuitive UX for Students and Teachers

| Item | Status | Notes |
|---|---|---|
| Primary actions ≤ 2 clicks from role landing | ✅ Plan | Dashboard → standard row → drill-down = 1 click. Dashboard → student row → profile = 1 click. Question detail drawer = 1 more click but is non-primary. |
| Single primary task per screen | ✅ Plan | Standard view = "which questions need re-teaching". Student view = "how is this student doing". Drawer = "what is this one question". |
| Plain English, 8th-grade reading level | ✅ Plan | Existing dashboard copy is already at this level; new copy will match. |
| Forgiveness | n/a | No destructive actions in this feature. |
| WCAG 2.1 AA color contrast | ✅ Plan | Reuses existing color-coding palette (`emerald-700`, `amber-700`, `rose-700`). Already AA in the dashboard. New traffic-light dots get aria-labels. |
| Keyboard nav & focus order | ✅ Plan | Drawer uses `<dialog>` pattern with focus trap. All buttons get explicit `aria-pressed` where toggling. |
| Math rendered with react-katex | ✅ Plan | Question stems rendered via existing `<LatexText>`. No `dangerouslySetInnerHTML`. |
| Responsive ≥ 360px | ✅ Plan | Tables already have `overflow-x-auto` per existing pattern. Drawer collapses to bottom-sheet on narrow viewports. |

**Gate**: PASS.

### Principle III — Scalability and Reliability for Concurrent Users

| Item | Status | Notes |
|---|---|---|
| p95 server ≤ 500ms / page-interactive ≤ 3s | ✅ Plan | Verified per-endpoint above. Aggregation runs in-memory after a bounded set of paginated `IN` queries. |
| No N+1 on hot paths | ✅ Plan | All endpoints use the chunked `IN` pattern from `pagination.ts`. The "in-scope users" set is resolved **once** per request and reused for all sub-queries. |
| Indexed columns for hot filters | ✅ Plan | Reuses existing indexed accesses: `attempts(user_id, answered_at)`, `attempts(question_id)`, `school_members(school_id)`. Will verify via `EXPLAIN` in Phase 0 research (see research.md). |
| Server Components for data fetching | ✅ Plan | Standard and Student pages are Server Components that fetch via the new route handlers (or directly via the same lib functions when called from a server context). Client wrapper only handles filters and the chart. |
| Heavy/upstream calls guarded | n/a | No Gemini or third-party calls in this feature. |
| `localStorage` SSR-safe | ✅ Plan | Only one `localStorage` use is contemplated: persisting the sample-question modal's selection mode across reopens (future enhancement, NOT v1). v1 = in-modal state only. |
| Capacity note in PR | ✅ Plan | PR #72 description will be updated with concurrency math (≤ 4 new GETs, each ≤ 500ms p95, called only when a teacher actively browses analytics — no background polling). |

**Gate**: PASS.

### Principle IV — Curriculum Alignment with Keystone Biology Standards

| Item | Status | Notes |
|---|---|---|
| Standards from `src/lib/standards.ts` | ✅ Plan | Standard IDs displayed in the new UI come from `STANDARD_DEFINITIONS` via `getStandardById()`. No parallel taxonomy. |
| Every shown question tagged with a standard | ✅ Plan | The drill-down's standard parameter IS a `STANDARD_DEFINITIONS.id`. Untagged attempts (legacy null `standard_id`) are surfaced under an explicit "Unaligned" bucket and excluded from per-standard drill-downs to avoid silently misclassifying them. |
| No content authoring in this feature | ✅ Plan | Read-only display only. No new prompts or rubrics. |

**Gate**: PASS.

### Principle V — Student Data Privacy and Role-Based Access

| Item | Status | Notes |
|---|---|---|
| Role enforced at every layer (RLS, route, UI) | ✅ Plan | Existing RLS on `attempts` and `profiles` is unchanged. Every new route handler calls `supabase.auth.getUser()` then resolves role via `resolveRoleWithServerFallback()`. UI hides admin-only controls based on the role returned from the existing `/api/auth/me` flow. |
| Role priority `profiles.role` → `user_metadata` → `app_metadata` | ✅ Plan | Reuses `resolveRoleWithServerFallback()`. |
| Re-verify via `getUser()` in handlers | ✅ Plan | Mirrors `/api/teacher-dashboard/route.ts`. |
| `SUPABASE_SERVICE_ROLE_KEY` server-only | ✅ Plan | Used only via `createSupabaseAdminClient()` inside route handlers and server lib. Never imported by client components. |
| Env via `src/lib/supabase/env.ts` | ✅ Plan | No new `process.env` references. |
| No PII to third parties | ✅ Plan | No outbound calls. |
| Schema changes via migration | n/a | No schema changes. |
| Teacher isolation: cannot see other schools' students | ✅ Plan | Scoping pipeline identical to existing `/api/teacher-dashboard`. Cross-school leak is impossible without bypassing the same code path that already gates dashboard data. Verified by a dedicated cross-school test (SC-006). |

**Gate**: PASS.

### Technical Standards & Development Workflow

| Item | Status | Notes |
|---|---|---|
| Next.js 16 App Router, React 19, TS, Tailwind v4 | ✅ Plan | All new routes and components follow the existing patterns. |
| No `any` | ✅ Plan | All new types in `src/lib/analytics/` and `src/components/` are explicit; `unknown` + type guards where needed. |
| Supabase clients per context | ✅ Plan | `createSupabaseServerClient()` for Server Components and Route Handlers; `createSupabaseAdminClient()` for cross-user reads (same as existing `/api/teacher-dashboard`). No browser-side data access for analytics. |
| Tests for utilities + role-protected handlers | ✅ Plan | Each new endpoint gets unauthorized + role tests. Each new aggregation function gets a unit test. |
| Migrations for DB changes | n/a | None. |
| `npm run lint` / `npm test` green | ✅ Plan | Pre-merge gate, enforced by CI. |

**Gate**: PASS overall. No violations to justify in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-teacher-question-analytics/
├── spec.md                          # /speckit-specify + /speckit-clarify output (DONE)
├── plan.md                          # This file (/speckit-plan output)
├── research.md                      # Phase 0 output (/speckit-plan)
├── data-model.md                    # Phase 1 output (/speckit-plan)
├── quickstart.md                    # Phase 1 output (/speckit-plan)
├── contracts/                       # Phase 1 output (/speckit-plan)
│   ├── GET-teacher-dashboard-standards-id.md
│   ├── GET-teacher-dashboard-students-id.md
│   ├── GET-teacher-dashboard-questions-id.md
│   └── GET-teacher-dashboard-standards-id-sample.md
├── checklists/
│   └── requirements.md              # /speckit-specify output (DONE)
└── tasks.md                         # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── teacher-dashboard/
│   │   ├── page.tsx                                       # EXISTING — add Sample Question button + link rows to drill-downs
│   │   ├── standards/
│   │   │   └── [standardId]/
│   │   │       └── page.tsx                               # NEW — Standard drill-down (Server Component)
│   │   └── students/
│   │       └── [studentId]/
│   │           └── page.tsx                               # NEW — Student profile (Server Component)
│   └── api/
│       └── teacher-dashboard/
│           ├── route.ts                                   # EXISTING
│           ├── standards/
│           │   └── [standardId]/
│           │       ├── route.ts                           # NEW — GET drill-down payload
│           │       └── sample/
│           │           └── route.ts                       # NEW — GET sample question for standard
│           ├── students/
│           │   └── [studentId]/
│           │       └── route.ts                           # NEW — GET student profile payload
│           └── questions/
│               └── [questionId]/
│                   └── route.ts                           # NEW — GET question detail payload
├── components/
│   ├── teacher/
│   │   ├── StandardDrillDown.tsx                          # NEW — client component (filters + table)
│   │   ├── StandardDrillDown.test.tsx                     # NEW — unit test
│   │   ├── StudentProfile.tsx                             # NEW — client component (chart + answer list + filters)
│   │   ├── StudentProfile.test.tsx                        # NEW — unit test
│   │   ├── QuestionDetailDrawer.tsx                       # NEW — read-only question detail drawer
│   │   ├── SampleQuestionModal.tsx                        # NEW — sample question modal with mode picker
│   │   └── AccuracyLineChart.tsx                          # NEW — recharts wrapper (rolling vs cumulative)
│   └── shared/
│       └── LatexText.tsx                                  # EXISTING — reused for question stems
├── lib/
│   ├── analytics/
│   │   ├── teacher-dashboard-server.ts                    # EXISTING
│   │   ├── standard-drill-down-server.ts                  # NEW — aggregator for Standard drill-down
│   │   ├── standard-drill-down-server.test.ts             # NEW — unit test
│   │   ├── student-profile-server.ts                      # NEW — aggregator for Student profile (chart + list)
│   │   ├── student-profile-server.test.ts                 # NEW — unit test
│   │   ├── question-detail-server.ts                      # NEW — aggregator for Question detail drawer
│   │   ├── question-detail-server.test.ts                 # NEW — unit test
│   │   ├── sample-question-server.ts                      # NEW — sample-question selection (random / high-acc / low-acc)
│   │   └── sample-question-server.test.ts                 # NEW — unit test
│   ├── auth/
│   │   ├── role.ts                                        # EXISTING
│   │   └── server-role.ts                                 # EXISTING
│   └── supabase/
│       ├── server.ts                                      # EXISTING
│       └── admin.ts                                       # EXISTING
└── types/
    └── question.ts                                        # EXISTING — reused

supabase/
└── migrations/                                            # NO new migrations
```

**Structure Decision**: Web application (Next.js App Router, single `src/`
tree). Pages, route handlers, and lib utilities all coexist in `src/` per
the existing project convention. New code is organized by feature concern:

- `src/app/teacher-dashboard/*` for new Server Component pages,
- `src/app/api/teacher-dashboard/*` for new Route Handlers,
- `src/lib/analytics/*-server.ts` for pure aggregation utilities
  (testable in isolation),
- `src/components/teacher/*` for new client components.

This mirrors the existing `/api/teacher-dashboard/route.ts` +
`src/lib/analytics/teacher-dashboard-server.ts` +
`src/app/teacher-dashboard/page.tsx` trio, which is the closest precedent.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

No violations. All five Core Principles, both Technical Standards
sections, and all six Development Workflow gates pass without exception.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | _(n/a)_ | _(n/a)_ |

## Post-Design Constitution Re-Check

After Phase 0 (research.md) and Phase 1 (data-model.md, contracts/,
quickstart.md), re-evaluating the gates:

| Principle | Status | Notes |
|---|---|---|
| I. English-Only | ✅ PASS | All Phase 0/1 artifacts written in English; no UI strings introduced yet but planned copy is English. |
| II. Intuitive UX | ✅ PASS | Drawer pattern (research R8), default sort (research R9), and per-endpoint clarity confirmed via contracts. Drill-down lands on lowest-accuracy first → SC-001 met by default. |
| III. Scalability & Reliability | ✅ PASS | Index coverage verified (research R6) — no new indexes / migrations required. Pagination chosen (research R7) — 50/page with cursor. All endpoint p95 budgets restated in contracts. |
| IV. Curriculum Alignment | ✅ PASS | `standardId` path param is a `STANDARD_DEFINITIONS.id`; no parallel taxonomy. Untagged attempts surfaced under a reserved `unaligned` bucket only, never silently misclassified. |
| V. Student Data Privacy | ✅ PASS | Each contract re-asserts auth re-verification + scope resolution; 403 (not 404) for cross-school students per `GET …/students/[id]` contract (no existence leak). Confidence stats explicitly out of v1 (research R10) — fewer cross-user reads than the admin Question Quality endpoint. |
| Technical Standards | ✅ PASS | No new dependencies (Recharts already vendored). All new types explicit, no `any`. Supabase client usage matches existing patterns. |
| Dev Workflow & Quality Gates | ✅ PASS | Test surface enumerated per contract. Lint + Vitest are CI gates. No migrations to review. |

**Gate**: PASS post-design. Ready to proceed to `/speckit-tasks`.
