# Contract: `GET /api/teacher-dashboard/standards/[standardId]`

**Purpose**: Standard drill-down payload (User Story 1). Returns every
question the in-scope students have attempted under the given standard,
with accuracy color-coding, per-mode breakdown, and per-option pick
distribution.

**Auth**: `teacher` or `admin` only. Re-verified inside the handler via
`supabase.auth.getUser()` + `resolveRoleWithServerFallback()`.

**Scoping**:

- `teacher`: students in the teacher's `school_teachers` ∪
  `schools.teacher_user_id` set, minus `profiles.excluded_from_analytics`.
- `admin`: by default same scoping (their `school_teachers` join). With
  `scope=all`, expands to every school. Anyone else: 403.

## Request

`GET /api/teacher-dashboard/standards/{standardId}?<query>`

Path:

| Param | Type | Required | Notes |
|---|---|---|---|
| `standardId` | string | yes | Must match an `id` in `STANDARD_DEFINITIONS`. If unknown → 404. The literal `unaligned` is reserved for the legacy `standard_id = NULL` bucket. |

Query (all optional; same names and semantics as the existing dashboard
endpoint so URL state can be passed through):

| Param | Type | Default | Notes |
|---|---|---|---|
| `range` | `7d` \| `30d` \| `all` | `30d` | Date window on `attempts.answered_at`. |
| `mode` | `practice` \| `exam` \| `review` \| `compare` \| `all` | `compare` | Filter on `attempts.mode`. `compare` keeps all and emits the `byMode` breakdown. |
| `source` | `assigned` \| `self` \| `all` | `all` | `assigned` ⇒ `assignment_id IS NOT NULL`; `self` ⇒ `assignment_id IS NULL`. |
| `classId` | string | none | School id filter. Must be in caller's allowed schools. |
| `studentId` | string | none | When provided, payload is scoped to that single student and a flag is set so the UI labels itself "filtered to one student". |
| `scope` | `selected` \| `all` | `selected` | Admin-only widener. `teacher` callers passing `all` are silently downgraded to `selected`. |

## Response

**200 OK** — body shape is `StandardDrillDownPayload` (see
`data-model.md`):

```jsonc
{
  "standardId": "3.1.9-12.A",
  "standardLabel": "Construct an explanation based on evidence …",
  "summary": {
    "totalAttempts": 296,
    "totalCorrect": 198,
    "accuracy": 0.669,
    "uniqueStudents": 24,
    "questionsAttempted": 31
  },
  "questions": [
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
      "attempted": 28,
      "uniqueStudents": 24,
      "correct": 12,
      "accuracy": 0.429,
      "bucket": "low",
      "averageTimeSec": 41,
      "byMode": {
        "practice": { "attempted": 18, "correct":  9, "accuracy": 0.500 },
        "exam":     { "attempted":  6, "correct":  1, "accuracy": 0.167 },
        "review":   { "attempted":  4, "correct":  2, "accuracy": 0.500 }
      },
      "optionDistribution": [
        { "optionId": "opt_1", "text": "DNA",     "isCorrect": false, "picks": 12, "share": 0.429 },
        { "optionId": "opt_2", "text": "RNA",     "isCorrect": true,  "picks": 12, "share": 0.429 },
        { "optionId": "opt_3", "text": "Protein", "isCorrect": false, "picks":  3, "share": 0.107 },
        { "optionId": "opt_4", "text": "Lipid",   "isCorrect": false, "picks":  1, "share": 0.036 }
      ]
    }
    // … sorted: accuracy ASC, attempted DESC, questionId ASC
  ]
}
```

Sort: `accuracy ASC, attempted DESC, questionId ASC` (per research R9).

Filtering: `questions` contains only items with `attempted ≥ 1` (FR-054).

**401 Unauthorized**:

```json
{ "error": "Unauthorized" }
```

**403 Forbidden**:

```json
{ "error": "Forbidden" }
```

**404 Not Found** — unknown `standardId`:

```json
{ "error": "Unknown standard" }
```

**400 Bad Request** — invalid query param (e.g. `range=99`):

```json
{ "error": "Invalid query: range" }
```

**500 Internal Server Error** — upstream DB failure. Body shape:

```json
{ "error": "Failed to load standard drill-down" }
```

## Performance

- p95 ≤ 500ms for 30 students × ≤ 1,000 in-scope attempts (per plan).
- Single Supabase round-trip set: students set → attempts → previews.
  All in chunked `IN` per `pagination.ts`. No N+1.
- Response size cap: ≤ 200 KB JSON (≈ 50 KB at the realistic ceiling).
  No truncation at v1; if a class ever exceeds the cap we'll add
  question-set chunking in v1.1.

## Test surface

The route handler test (`route.test.ts`) MUST assert:

1. Unauthenticated → 401.
2. `student` role → 403.
3. Teacher with no schools → `200` with empty `questions` and zero
   summary counts.
4. Teacher with schools but no attempts → same as above.
5. Teacher with mixed-school students (cross-school fixture): only the
   teacher's school appears in counts (SC-006).
6. `studentId` filter narrows correctly.
7. `mode=compare` populates `byMode` for every question; `mode=exam`
   filters but omits `byMode` or populates only `exam`.
8. Unknown `standardId` → 404.
9. Admin with `scope=all` widens; teacher with `scope=all` does not.
10. Exam-attempt deduping is applied (verified via a fixture with two
    practice rows and two assignment-exam rows on the same question;
    expect 1 exam attempt counted after dedupe).
