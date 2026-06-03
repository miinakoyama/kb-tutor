# Contract: `GET /api/teacher-dashboard/questions/[questionId]`

**Purpose**: Question detail drawer payload (User Story 3). Returns
in-scope stats for a single question — total attempts, distinct
students, correct count, accuracy %, average / p50 / p90 time,
per-mode breakdown, and per-option pick distribution. When called
from the Student profile, also returns a `studentContext` block with
that single student's attempt details for the question.

**Auth**: `teacher` or `admin` only.

**Scoping**:

- `teacher`: scope locked to the teacher's `studentIds` (same
  pipeline as elsewhere).
- `admin`: defaults to the admin's own schools; with `scope=all`,
  widens to every school.

## Request

`GET /api/teacher-dashboard/questions/{questionId}?<query>`

Path:

| Param | Type | Required | Notes |
|---|---|---|---|
| `questionId` | string | yes | UUID. If the question has no preview at all (not in `generated_questions` nor in any `assignment_question_snapshots`) → 404. Otherwise the question is returned even if it has zero in-scope attempts (empty-state UI). |

Query:

| Param | Type | Default | Notes |
|---|---|---|---|
| `range` | `7d` \| `30d` \| `all` | `30d` | Date window. |
| `mode` | `practice` \| `exam` \| `review` \| `all` | `all` | Filter on `attempts.mode`. |
| `source` | `assigned` \| `self` \| `all` | `all` | Same semantics. |
| `classId` | string | none | Restrict to one school. Must be in the caller's allowed schools. |
| `studentId` | string | none | When provided **and** the caller has access to that student, the response includes a `studentContext` block. Other counts remain class-wide (per spec Assumptions). |
| `scope` | `selected` \| `all` | `selected` | Admin-only widener. Teacher: silently downgraded. |

## Response

**200 OK** — body shape is `QuestionDetailPayload`:

```jsonc
{
  "questionId": "q_abc123",
  "preview": {
    "text": "Which of the following …",
    "imageUrl": null,
    "options": [
      { "id": "opt_1", "text": "DNA" },
      { "id": "opt_2", "text": "RNA" },
      { "id": "opt_3", "text": "Protein" },
      { "id": "opt_4", "text": "Lipid" }
    ],
    "correctOptionId": "opt_2",
    "diagram": null
  },
  "standardId": "3.1.9-12.A",
  "standardLabel": "Construct an explanation …",
  "scope": "selected",
  "summary": {
    "totalAttempts": 28,
    "uniqueStudents": 24,
    "correct": 12,
    "accuracy": 0.429,
    "averageTimeSec": 41,
    "timeP50Sec": 38,
    "timeP90Sec": 95
  },
  "byMode": {
    "practice": { "attempted": 18, "correct":  9, "accuracy": 0.500, "averageTimeSec": 39 },
    "exam":     { "attempted":  6, "correct":  1, "accuracy": 0.167, "averageTimeSec": 52 },
    "review":   { "attempted":  4, "correct":  2, "accuracy": 0.500, "averageTimeSec": 33 }
  },
  "optionDistribution": [
    { "optionId": "opt_1", "text": "DNA",     "isCorrect": false, "picks": 12, "share": 0.429 },
    { "optionId": "opt_2", "text": "RNA",     "isCorrect": true,  "picks": 12, "share": 0.429 },
    { "optionId": "opt_3", "text": "Protein", "isCorrect": false, "picks":  3, "share": 0.107 },
    { "optionId": "opt_4", "text": "Lipid",   "isCorrect": false, "picks":  1, "share": 0.036 }
  ],
  "studentContext": {
    "studentId": "u_abc",
    "label": "Alex Carter",
    "selectedOptionId": "opt_1",
    "isCorrect": false,
    "answeredAt": "2026-05-22T08:11:00Z",
    "mode": "practice"
  }
}
```

Empty state (no in-scope attempts): `summary` zeros, `byMode` zeros,
`optionDistribution` shows every option with `picks = 0, share = 0`,
no `studentContext`. The UI renders "No students have attempted this
question yet" instead of "0% accuracy".

**401 / 403** as in earlier contracts. **404** only when the
question id has no preview anywhere; "has zero attempts in scope but
exists in the bank" returns 200 with empty stats.

## Performance

- p95 ≤ 300ms for one question scoped to ≤ 30 students.
- One `attempts WHERE question_id = … AND user_id IN (…)` query.
  Returns rows; `dedupeAssignmentExamAttempts` then aggregates.
- One preview lookup (`generated_questions` → fallback).
- No `analytics_events` query (research R10 — confidence stats out
  of v1 scope).

## Test surface

1. Unauthenticated → 401.
2. `student` role → 403.
3. Question not in bank at all → 404.
4. Question in bank but zero in-scope attempts → 200 with empty
   stats, no `studentContext`.
5. Teacher requesting question with `studentId` belonging to their
   class → 200 with `studentContext`.
6. Teacher requesting question with `studentId` outside their class
   → 200 **without** `studentContext` (no leak), other numbers
   class-wide.
7. Admin with `scope=all` widens; teacher with `scope=all` does not.
8. `byMode` zeros for modes with no in-scope attempts (never
   `NaN`).
9. Exam-attempt deduping applied (same fixture as before).
10. Numeric parity: total attempts / correct match the same question's
    row in the Standard drill-down payload for the same filters
    (SC-003).
