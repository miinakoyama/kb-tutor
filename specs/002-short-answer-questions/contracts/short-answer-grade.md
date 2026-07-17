# Contract: POST /api/short-answer/grade

Grades one part submission and returns student-facing feedback. Used by all modes (practice/review/assignment immediately; exam mode calls it per part at exam submission with `mode: "exam"`).

**Auth**: authenticated (any role). Handler re-verifies `supabase.auth.getUser()`. Students grade only their own submissions (rows written as `auth.uid()`).

## Request

```json
{
  "questionId": "sa-0001",
  "questionSetId": "uuid-or-null",
  "assignmentId": "text-or-null",
  "partLabel": "A",
  "studentResponse": "The bag traps water vapor so it can be measured.",
  "attemptNumber": 1,
  "priorGaps": { "A": "..." },
  "mode": "practice",
  "clientAttemptId": "uuid"
}
```

- `partLabel`: `"A" | "B" | "C"`; `attemptNumber`: `1 | 2`; `mode`: `"practice" | "review" | "exam"`.
- `priorGaps`: optional, Method 1 coherence input only.
- Client NEVER sends method/model/temperature — the server resolves the effective feedback config (school setting → default → hardcoded fallback).

## Behavior

1. Resolve item + part server-side (assignment snapshot when `assignmentId` set, else `generated_questions`). 404 if not a short-answer item.
2. Enforce attempt cap: reject with 409 if this part already has a resolved outcome or `attemptNumber` slot is taken (idempotent replays via `clientAttemptId` return the stored result, 200).
3. Empty/whitespace `studentResponse`: no LLM call; score 0, feedback `"No response was submitted."`, `method: "none"`; attempt IS recorded.
4. Otherwise dispatch to Method 1/2/3 per `reference-pipeline.md` (Method 1 loads GradeOpt rules + KB retrieval; Method 2 two calls; Method 3 boundary examples). One automatic retry on invalid LLM output.
5. Persist `short_answer_attempts` row (+ `attempts` summary row when the part resolves), then respond.
6. LLM failure after retry: **502**, nothing persisted, attempt not consumed.

## Response 200

```json
{
  "attemptId": "uuid",
  "score": 0,
  "maxScore": 1,
  "correct": false,
  "resolved": false,
  "feedback": {
    "verdict": "incorrect",
    "verdictPhrase": "Good try!",
    "segments": [
      { "label": "What I noticed", "text": "..." },
      { "label": "Try this", "text": "..." }
    ],
    "modelAnswer": null,
    "glossaryTerms": ["transpiration"]
  },
  "confidence": "medium",
  "triesLeft": 1
}
```

- `feedback.verdict`: `"correct" | "incorrect"` (binary; no partial).
- `modelAnswer` is non-null ONLY when `resolved === true && correct === false` (final attempt), and then `segments` is empty (spec FR-008).
- `confidence` present only for Method 3; never displayed to students (stored for teachers).
- Exam mode (`mode: "exam"`): same response shape; the client shows nothing until exam review.

## Errors

| Status | Case |
|---|---|
| 400 | Malformed body, invalid partLabel/attemptNumber, response over maxLength |
| 401 | Unauthenticated |
| 404 | Unknown question / not open-ended |
| 409 | Attempt cap violated / part already resolved |
| 502 | LLM failure after retry — body `{ "error": "grading_unavailable", "retriable": true }` |
