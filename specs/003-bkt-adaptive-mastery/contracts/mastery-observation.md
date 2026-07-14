# Contract: Mastery Observation

Mastery updates are an internal persistence contract shared by MCQ attempts and SAQ part attempts. No public client calls the BKT function directly.

## Source integration

### MCQ

- Existing endpoint: `POST /api/analytics/attempts`.
- Route re-verifies the user and access to the question or assignment snapshot.
- Route derives `is_correct` by comparing `selectedOptionId` with authoritative question content; a client `isCorrect` field is ignored for persistence or retained only for backward-compatible validation telemetry.
- Insert/upsert into `attempts` retains `client_attempt_id` idempotency.
- Assignment Exam option clicks persist with `is_finalized=false` for resume; exam submission appends one finalized MCQ attempt per answered question.
- Trigger processes only rows whose `is_finalized=true` and `selected_option_id != 'short-answer'`.

### SAQ

- Existing endpoint: `POST /api/short-answer/grade`.
- Existing server grading determines `score`, `max_score`, and `is_correct`.
- Trigger processes each inserted `short_answer_attempts` row.
- The question-level summary inserted into `attempts` uses `selected_option_id='short-answer'` and is ignored by the MCQ trigger.

## Internal function

`public.apply_bkt_observation(source_kind text, source_attempt_id uuid, source_revision smallint default 1)`

The function is not executable by `anon` or ordinary clients. Trigger execution supplies the current row context.

Processing guarantees:

1. No active mapping -> attempt persists, no mastery event, and coverage remains unresolved.
2. Existing `(source_kind, source_attempt_id, source_revision)` -> return existing result without mutation.
3. Resolve the exact active mapping version and current active parameter set for the format.
4. Initialize absent student/KC state from that set's `P(L0)`.
5. Lock the state row before calculating.
6. Correct posterior:

```text
posterior = prior*(1-S) / (prior*(1-S) + (1-prior)*G)
```

7. Incorrect posterior:

```text
posterior = prior*S / (prior*S + (1-prior)*(1-G))
```

8. Transition:

```text
result = posterior*(1-F) + (1-posterior)*T
```

9. Append event and update current state in the source insert transaction.
10. Mastered means `result >= parameter_set.mastery_threshold`.

## Trigger result

The attempt API response may include the server-derived result without exposing model internals:

```json
{
  "attemptRecorded": true,
  "isCorrect": true,
  "masteryUpdated": true
}
```

`masteryUpdated=false` is valid for an unresolved/non-adaptive question and must not make the attempt fail.

## Out-of-order and correction behavior

- Stable chronology: `(answered_at, event.created_at, event.id)`.
- An out-of-order source or corrected score appends a correction/replay audit; source history is not deleted.
- Replay uses only each source's latest non-superseded revision and replaces `student_kc_mastery` with the deterministic final state.
- A correction must yield the same current state as a clean replay containing only final accepted outcomes.

## Golden conformance cases

- MCQ prior `0.30`, correct -> posterior `0.6067415730`, result `0.6460674157`.
- MCQ prior `0.30`, incorrect -> posterior `0.0540540541`, result `0.1486486486`.
- Exact duplicate -> no second event/state change.
- SAQ A/B/C sharing one KC -> three ordered observations.
- Incorrect retry then correct retry -> two ordered observations.
- Same two sources arriving in opposite receipt order -> equal replayed final state.
