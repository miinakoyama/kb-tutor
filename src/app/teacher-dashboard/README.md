# Teacher dashboard

Pages and routes under `src/app/teacher-dashboard/**` plus the matching
API routes under `src/app/api/teacher-dashboard/**` together provide
teachers (and admins) with class-level analytics.

## Routes

| Path                                              | Purpose                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/teacher-dashboard`                              | Dashboard summary — by-standard table, by-student table, sample question button. |
| `/teacher-dashboard/standards/[standardId]`       | Standard drill-down: every question this teacher's students attempted, color-coded by accuracy. |
| `/teacher-dashboard/students/[studentId]`         | Student profile: accuracy line chart (rolling 20-attempt window by default + cumulative toggle) and a paginated answer history. |

Both new pages mount a shared `QuestionDetailDrawer` (read-only) that
opens from question rows via `?question=<id>` in the URL.

## API

| Path                                                              | Returns                                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/teacher-dashboard`                                      | Dashboard summary (existing).                                          |
| `GET /api/teacher-dashboard/standards/[standardId]`               | Standard drill-down payload.                                            |
| `GET /api/teacher-dashboard/students/[studentId]`                 | Student profile payload (summary + chart + answer page).                |
| `GET /api/teacher-dashboard/questions/[questionId]`               | Question detail drawer payload (with optional `studentContext`).        |
| `GET /api/teacher-dashboard/standards/[standardId]/sample`        | Sample-question modal payload.                                          |

Every handler re-verifies the user with `supabase.auth.getUser()` and
re-resolves the role with `resolveRoleWithServerFallback()`. Teacher
scope is built via `resolveTeacherScope` from
`src/lib/analytics/teacher-scope.ts`; admins default to that same
scope and may pass `?scope=all` to widen to every school. See the
spec at `specs/001-teacher-question-analytics/` for the full design.

## Key shared utilities

- `src/lib/analytics/teacher-analytics-types.ts` — wire types for the
  four new endpoints.
- `src/lib/analytics/teacher-scope.ts` — (school, student) scope
  resolver shared by every endpoint.
- `src/lib/analytics/question-preview.ts` — `generated_questions →
  assignment_question_snapshots` preview lookup (also used by the
  admin Question Quality page).
- `src/lib/analytics/teacher-analytics-query.ts` — request query
  parser shared by every endpoint.
- `src/lib/analytics/percentile.ts` — nearest-rank percentile helper.
- `src/lib/analytics/exam-attempt-dedupe.ts` — exam-attempt dedupe
  (existing, reused for parity with the dashboard summary).

## CSV exports

- `src/lib/csv/teacher-dashboard-standard.ts` — per-standard CSV.
- `src/lib/csv/teacher-dashboard-student.ts` — per-student CSV.

## Things this dashboard intentionally does NOT do

- The teacher dashboard does **not** open the admin
  `/content/questions` manager. That route stays admin-only and is
  unchanged by this feature.
- The drawer **does not** include confidence stats. Confidence is
  surfaced only by the admin Question Quality page (deferred to v1.1
  for the teacher drawer; see research R10 in the spec).
- No background polling: each new endpoint is fetched only when the
  teacher actively browses the matching page.
