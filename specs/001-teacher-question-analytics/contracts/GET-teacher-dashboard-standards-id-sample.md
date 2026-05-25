# Contract: `GET /api/teacher-dashboard/standards/[standardId]/sample`

**Purpose**: Sample question for the dashboard's "Sample question"
modal (User Story 4). Returns one question from the standard's bank
according to the caller-specified selection mode, plus enough
metadata for the modal to support "Show another" without re-fetching
the whole bank.

**Auth**: `teacher` or `admin` only.

**Scoping**: The selection orderings depend on **in-scope accuracy**
(the teacher's students' attempts), so the same scoping pipeline
used by the standard drill-down applies. The `Random` mode does not
depend on accuracy but is still scoped because the modal lives in the
teacher's dashboard surface.

## Request

`GET /api/teacher-dashboard/standards/{standardId}/sample?<query>`

Path:

| Param | Type | Required | Notes |
|---|---|---|---|
| `standardId` | string | yes | Must match a `STANDARD_DEFINITIONS.id`. Otherwise → 404. |

Query:

| Param | Type | Default | Notes |
|---|---|---|---|
| `mode` | `random` \| `high_accuracy_first` \| `low_accuracy_first` | `random` | Selection mode (per FR-044). |
| `seed` | string | server-generated | Used only by `random`. Stable shuffle key for the modal session. Server returns the seed in the response so the client can keep passing it back. |
| `skip` | integer ≥ 0 | `0` | Position within the current mode's ordering. The modal increments `skip` on each "Show another". |
| `range`, `mode_filter`, `source`, `classId` | as elsewhere | dashboard defaults | Used to scope the accuracy ordering. (`mode` is taken; the request filter is named `mode_filter` to disambiguate.) |

## Response

**200 OK** — body shape is `SampleQuestionPayload`:

```jsonc
{
  "questionId": "q_xyz",
  "preview": {
    "text": "A scientist observes …",
    "imageUrl": null,
    "options": [
      { "id": "opt_1", "text": "…" },
      { "id": "opt_2", "text": "…" },
      { "id": "opt_3", "text": "…" },
      { "id": "opt_4", "text": "…" }
    ],
    "correctOptionId": "opt_3",
    "diagram": null
  },
  "standardId": "3.1.9-12.A",
  "standardLabel": "Construct an explanation …",
  "position": 0,
  "totalAvailable": 42,
  "isLast": false,
  "mode": "low_accuracy_first",
  "seed": "f1c4-7c5a-9931-2bb1"
}
```

Ordering semantics:

- `random`: deterministic shuffle of all bank questions for the
  standard using `seed`. Same `seed` + same `skip` always returns
  the same question. The client generates the seed on modal open
  (or reuses the server-supplied one) and increments `skip` for
  "Show another".
- `high_accuracy_first`: `accuracy DESC, attempts DESC, questionId ASC`.
  Unattempted bank questions appended at the end (FR-046).
- `low_accuracy_first`: `accuracy ASC, attempts DESC, questionId ASC`.
  Unattempted bank questions appended at the end.

`position` is the 0-based index in the current ordering. `totalAvailable`
is the count of distinct bank questions tagged with the standard
(attempted + unattempted). `isLast = (position + 1 === totalAvailable)`.

Empty bank for that standard:

**200 OK**:

```json
{
  "questionId": null,
  "preview": null,
  "standardId": "3.1.9-12.A",
  "standardLabel": "Construct an explanation …",
  "position": 0,
  "totalAvailable": 0,
  "isLast": true,
  "mode": "random",
  "seed": "…"
}
```

The modal renders the "No sample question available for this
standard" empty state when `questionId == null`.

**401 / 403** as elsewhere. **404** for unknown `standardId`.

## Performance

- p95 ≤ 250ms.
- One scan over the bank for the standard (typically ≤ 100
  questions) + one scoped attempts query to compute accuracy. Both
  reuse the same `studentIds` set already resolved by the dashboard
  pipeline.
- The endpoint deliberately returns a single question (not the full
  ordering) so the wire payload stays tiny and "Show another" is
  one cheap round-trip rather than a bulk transfer.

## Test surface

1. Unauthenticated → 401.
2. `student` role → 403.
3. Standard with empty bank → 200 with `questionId: null`,
   `totalAvailable: 0`, `isLast: true`.
4. Standard with one bank question → first call returns it,
   `isLast: true`; second call with `skip=1` returns the same
   question and `isLast: true` (deterministic exhaustion behavior
   verified against the modal's "Show another disables" expectation).
5. `random` mode determinism: same `seed` + same `skip` → same
   `questionId`. Different `skip` → different `questionId` (until
   exhausted).
6. `high_accuracy_first`: fixture with three questions of accuracy
   {0.9, 0.6, 0.3} and one unattempted question → ordering is
   `[0.9, 0.6, 0.3, unattempted]`.
7. `low_accuracy_first`: same fixture → ordering reverses for the
   attempted ones; unattempted still at the end:
   `[0.3, 0.6, 0.9, unattempted]`.
8. Tie-breakers: two questions with accuracy 0.5 → the one with
   more attempts is ranked first.
9. Unknown standard id → 404.
10. Teacher with no in-scope students still gets a valid response
    for `random` (no scoping data needed for ordering); for the
    accuracy modes, unattempted bank questions are returned in
    `questionId ASC` order (every accuracy bucket is empty,
    everything is "unattempted").
