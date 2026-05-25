# Contract: `GET /api/teacher-dashboard/students/[studentId]`

**Purpose**: Student profile payload (User Story 2). Returns the
student's summary, the accuracy-over-time chart points (rolling +
cumulative), the assignment and standard filter options derived from
their attempt history, and the first page of the answer list.

**Auth**: `teacher` or `admin` only. Re-verified in the handler.

**Scoping**:

- `teacher`: the `studentId` MUST belong to one of the teacher's
  schools (via `school_members`). Anyone else → 403, **not** 404
  (don't leak existence of the student).
- `admin`: any student is accessible.

## Request

`GET /api/teacher-dashboard/students/{studentId}?<query>`

Path:

| Param | Type | Required | Notes |
|---|---|---|---|
| `studentId` | string | yes | UUID. Must be a member of one of the caller's schools (for teacher). |

Query (all optional):

| Param | Type | Default | Notes |
|---|---|---|---|
| `range` | `7d` \| `30d` \| `all` | `30d` | Date window on `attempts.answered_at`. |
| `mode` | `practice` \| `exam` \| `review` \| `all` | `all` | Filter on `attempts.mode`. No `compare` here — the chart is single-series. |
| `source` | `assigned` \| `self` \| `all` | `all` | Same semantics as elsewhere. |
| `assignmentId` | string | none | If present, restricts chart, summary, and answer list to that assignment's attempts. |
| `standardId` | string | none | If present, restricts to that standard. Combined with `assignmentId` is AND. |
| `chartView` | `rolling` \| `cumulative` | `rolling` | The chart endpoint computes both fields on every point regardless; this param is forwarded so the answer list summary can highlight the matching number. The chart points always carry both. |
| `cursor` | string (ISO ts) | none | Pagination cursor for the answer list: `answered_at` of the last row of the previous page. The page size is fixed at 50. |

## Response

**200 OK** — body shape is `StudentProfilePayload` (see
`data-model.md`):

```jsonc
{
  "student": {
    "id": "u_abc",
    "label": "Alex Carter",
    "classId": "sch_north",
    "classLabel": "North High"
  },
  "summary": {
    "totalAttempts": 99,
    "totalCorrect": 78,
    "accuracy": 0.788,
    "averageTimeSec": 53,
    "status": "on_track"
  },
  "filters": {
    "assignments": [
      { "id": "asg_1", "label": "Cell Structure Quiz" },
      { "id": "asg_2", "label": "Genetics Warmup" }
    ],
    "standards": [
      { "id": "3.1.9-12.A", "label": "Construct an explanation …" },
      { "id": "3.1.9-12.B", "label": "Develop and use a model …" }
    ]
  },
  "chart": [
    {
      "attemptIndex": 1,
      "answeredAt": "2026-05-04T10:01:11Z",
      "rollingAccuracy": 1.000,
      "cumulativeAccuracy": 1.000,
      "isSmallSample": true
    }
    // … one point per attempt, ordered ASC
  ],
  "answers": {
    "rows": [
      {
        "attemptId": "a_xyz",
        "questionId": "q_abc123",
        "questionStem": "Which of the following …",
        "selectedOptionId": "opt_2",
        "selectedOptionText": "RNA",
        "isCorrect": true,
        "correctOptionId": "opt_2",
        "timeSpentSec": 47,
        "mode": "practice",
        "assignmentId": null,
        "assignmentLabel": "Self-practice",
        "standardId": "3.1.9-12.A",
        "standardLabel": "Construct an explanation …",
        "answeredAt": "2026-05-22T08:11:00Z"
      }
      // … up to 50 rows, sorted answered_at DESC, attemptId ASC tiebreak
    ],
    "nextCursor": "2026-05-19T11:30:00Z"
  }
}
```

`chart` rolling-window math: each point's `rollingAccuracy` is the
sum of `is_correct` over the trailing **20** attempts ending at that
index, divided by the count of attempts in that window (so the
window naturally shrinks at the head of the series). `isSmallSample`
is `true` while the cumulative attempts ≤ 10 (per FR-024).

Empty student (zero attempts): `chart = []`, `answers.rows = []`,
`summary.totalAttempts = 0`, `status = "not_started"`,
`filters.assignments = []`, `filters.standards = []`. The UI shows
the "No attempts yet" empty state.

**401 / 403 / 404** as in the previous contract. **403 (not 404)**
when a teacher requests a student outside their schools, so the
endpoint does not leak which student ids exist.

## Performance

- p95 ≤ 500ms for 1,000 attempts.
- One Supabase round-trip for the attempt history (no pagination
  for chart computation — the entire in-scope history is needed to
  compute rolling correctly). Answer list is paginated with cursor.
- Response size at ceiling: ≈ 80 KB (1,000 chart points + 50 answer
  rows + filters).

## Test surface

1. Unauthenticated → 401.
2. `student` role → 403.
3. Teacher requesting a student outside their schools → 403 (no
   404 leakage). Asserts SC-006.
4. Teacher requesting their own student with zero attempts → 200
   with empty arrays and `status: "not_started"`.
5. Chart math: fixture with 25 alternating correct/incorrect
   attempts → first 10 points have `isSmallSample: true`; rolling
   accuracy at index 20 is exactly 0.5 (10/20); cumulative accuracy
   at index 25 is `13/25 = 0.52`.
6. Assignment filter narrows the chart, summary, and answer list
   consistently.
7. Standard filter combines with assignment filter via AND.
8. `assignmentLabel` falls back to `"Self-practice"` when
   `assignment_id` is null.
9. Cursor pagination: page 2 strictly precedes page 1 in time
   (cursor is the boundary `answered_at`).
10. Exam-attempt deduping is applied (same fixture as
    standards/[id] test).
