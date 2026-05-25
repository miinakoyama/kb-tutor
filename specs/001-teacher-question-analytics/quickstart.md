# Quickstart: Teacher Question Analytics

**Branch**: `cursor/teacher-question-analytics-ff1f` | **Date**: 2026-05-25

## What this feature gives you

Teachers and admins get four new question-level views layered on the
existing Teacher Dashboard:

| Surface | Route | Triggered from |
|---|---|---|
| Standard drill-down | `/teacher-dashboard/standards/[standardId]` | Click a row in "Performance by standard" on the dashboard. |
| Student profile | `/teacher-dashboard/students/[studentId]` | Click a student's name in "All students" on the dashboard. |
| Question detail drawer | `?question=[questionId]` (URL param on either of the above) | Click a question row in the drill-down, or an attempt row in the student profile. |
| Sample question modal | (modal on `/teacher-dashboard`) | Click "Sample question" on a standard row in the dashboard. |

## Run the app locally

```bash
npm install         # if you have not already
npm run dev         # starts on http://localhost:3000
```

The login page is at `/login`. Use a `teacher` or `admin` account.
Students will hit 403 on every new endpoint, by design.

Supabase is hosted (no local instance needed). The required env vars
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) come from Cursor Cloud secrets — no
`.env` file is committed.

## Manual smoke test (after implementation lands)

1. Sign in as a teacher whose class has at least one standard with a
   handful of attempted questions.
2. Go to `/teacher-dashboard`. Confirm the existing dashboard still
   renders unchanged.
3. Click any standard row → land on
   `/teacher-dashboard/standards/[standardId]`. Confirm:
   - The header shows the standard id and label.
   - The page lists every attempted question for that standard.
   - Each row has a colored bucket indicator (low / mid / high).
   - Expanding a row reveals the full stem, options, correct option
     highlighted, and per-option pick counts.
   - The dashboard's filters (range, source, mode, school, student)
     are preserved in the URL.
4. Click any question row → drawer opens with the question detail.
   The URL gains `?question=…`. Back button closes the drawer.
5. Return to `/teacher-dashboard`, click a student's name → land on
   `/teacher-dashboard/students/[studentId]`. Confirm:
   - The line chart renders with one point per attempt.
   - Toggling between "Rolling" and "Cumulative" changes the line
     without re-fetching.
   - The "small sample" indicator appears for the first ~10
     attempts and disappears thereafter.
   - The assignment and standard filters narrow the chart, summary,
     and answer list together.
   - The answer list shows the student's selected option (with the
     correct option highlighted when different).
6. Click an attempt row in the answer list → drawer opens with the
   question detail **plus** a "This student" inline annotation
   showing the student's pick for the question. Headline counts stay
   class-wide.
7. Return to `/teacher-dashboard` and click "Sample question" on any
   standard row. Confirm:
   - Modal opens with `Random` selected by default and shows one
     question.
   - Switching to `High accuracy first` re-orders to the
     highest-accuracy in-scope question for that standard.
   - Switching to `Low accuracy first` does the opposite.
   - "Show another" advances within the current mode; when the
     bank is exhausted, the button disables with a clear message.

## Automated tests

```bash
npm test                       # all Vitest tests, once
npm run test -- src/lib/analytics   # just the aggregator tests
npm run test -- src/components/teacher  # client component tests
```

Each new route handler test (`route.test.ts`) asserts at minimum:

- Unauthenticated → 401.
- `student` role → 403.
- Teacher with no schools / no attempts → empty payload, no 500.
- Cross-school isolation: a fixture with two schools and a teacher
  associated with only one returns zero rows for the other school's
  students (SC-006).

Each new aggregator (`*-server.test.ts`) is a pure-function test
with no Supabase mocking required.

## Performance sanity

Before merging, confirm the new endpoints stay under the budget:

```bash
# pseudo-curl with a fresh teacher session cookie
time curl -s -o /dev/null \
  "http://localhost:3000/api/teacher-dashboard/standards/3.1.9-12.A?range=30d&mode=compare&source=all"
# expect: real time well under 500ms with a class of 30 students
```

If any endpoint exceeds 500ms p95 at the realistic scale (30
students × ≤ 1,000 attempts), file a v1.1 task; do not ship past
the budget.

## Things this feature deliberately does NOT do

- It does NOT open the admin `/content/questions` manager to
  teachers. That route stays admin-only.
- It does NOT include confidence stats in the question detail
  drawer. Deferred to v1.1 (see research R10).
- It does NOT generate new questions on demand. The Sample question
  modal pulls only from the existing question bank.
- It does NOT add any DB migration. Read-only on existing tables.
- It does NOT change the role model. Same three roles, same
  `school_teachers` / `school_members` joins.
