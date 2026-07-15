# Contract: Adaptive Next Question

**Endpoint**: `POST /api/practice/next`

Returns one server-selected question for Self Practice. Exam, Review, and assignment snapshots do not call this endpoint.

## Authorization

- Re-verify the session with `supabase.auth.getUser()`.
- Resolve the profile role in-handler; only `student` may request a student selection.
- Resolve accessible Self Practice questions through current school membership and question-set policies.
- Never accept a user ID, mastery probability, KC target, candidate question IDs, or rotation state from the client.

## Request

```json
{
  "sessionId": "uuid-or-null",
  "standardIds": ["3.1.9-12.A", "3.1.9-12.C"],
  "previousSelectionId": "uuid-or-null"
}
```

Validation:

- `standardIds`: 1..24 unique active standard IDs, preserving planner order.
- `sessionId`: optional analytics session owned by the caller.
- `previousSelectionId`: optional prior selection owned by caller; diagnostic continuity only, not authority.
- Unknown fields ignored or rejected consistently with existing route style; malformed input returns `400`.

## Selection processing

1. Reject standards whose rollout status is not `enabled`; retain enabled standards in request order.
2. Load active KCs, current/default mastery, observation presence, per-standard rotation, recent standard/KC/question exposure, and accessible mapped questions with set-based indexed queries.
3. If any requested standard has unseen eligible KCs, select the first unseen KC by requested standard order then KC `sort_order`.
4. Otherwise select the least recently served standard that still has an unmastered KC and an eligible question.
5. Within that standard, apply cycle positions 0/1 = highest-probability unmastered, position 2 = least-recently-served unmastered. Never target the same KC more than twice consecutively when another eligible target exists.
6. Candidate questions must have an active mapping to the target KC. Common item rank is unattempted then least recently answered. Additional unmastered-KC coverage ranks SAQs only against SAQs at the same common rank; repeated target-KC parts do not add priority.
7. Compare-and-record the selection against the rotation version. Retry a version conflict at most twice.

## Response: selected (`200`)

```json
{
  "status": "selected",
  "selectionId": "uuid",
  "target": {
    "standardId": "3.1.9-12.A",
    "kcCode": "3.1.9-12.A2"
  },
  "question": {
    "id": "generated-question-id",
    "questionType": "mcq",
    "standardId": "3.1.9-12.A",
    "text": "Question text",
    "options": []
  }
}
```

The actual question object follows the existing renderable `Question` payload. The client must not use `target` or a locally computed correctness value as authority; `target` is included for diagnostics and may be omitted from student UI.

## Response: scope complete (`200`)

```json
{
  "status": "complete",
  "completedStandardIds": ["3.1.9-12.A", "3.1.9-12.C"]
}
```

Returned only when every active KC in every enabled requested standard has `P(L) >= 0.95`.

## Response: unavailable (`200`)

```json
{
  "status": "unavailable",
  "reason": "coverage_gap",
  "blockedStandardIds": ["3.1.9-12.C"],
  "message": "No eligible practice question is available for the remaining skills."
}
```

Reasons: `coverage_gap`, `no_enabled_standard`, or `no_accessible_question`. Messages are English and do not claim mastery.

## Errors

- `400`: invalid scope/body
- `401`: no authenticated user
- `403`: wrong role or session ownership
- `409`: rotation state changed after bounded retries; client may retry once
- `500`: unexpected persistence/query failure with generic English message

## Capacity

- No LLM call.
- No per-KC/per-question N+1 query.
- p95 target <=500ms.
- Response is `Cache-Control: no-store`.

