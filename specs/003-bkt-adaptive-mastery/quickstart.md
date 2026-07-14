# Quickstart: BKT Adaptive Mastery

**Feature**: `003-bkt-adaptive-mastery` | **Date**: 2026-07-11

This guide describes implementation verification after `/speckit-implement`. Planning does not apply migrations, call classifiers, or modify production data.

## 1. Prerequisites

- Node.js 22.x and npm
- Project dependencies installed
- A non-production Supabase project for migration/integration verification
- Server-side Supabase service role configured through existing env getters
- OpenAI and Gemini server keys only for the legacy classification preview
- One admin, one teacher, and two student test accounts

```bash
npm install
npm run lint
npm test
```

Expected: lint and unit tests pass. The known intermittent storage timeout may be rerun once and documented if it occurs.

## 2. Migration safety

Apply the feature migrations to a disposable/local or dedicated preview database first. Never use the Supabase dashboard for ad hoc schema changes.

Verify after migration:

```text
knowledge_components: seeded and ordered by standard
bkt_parameter_sets: exactly one active MCQ and one active SAQ v1 row
question_kc_assignments: content-mapped new questions synchronized
student_kc_mastery / bkt_mastery_events: empty before test attempts
bkt_standard_rollouts: disabled by default
classification/selection tables: empty
```

RLS checks:

- student reads own mastery, not another student's
- authorized teacher reads a student in an accessible school
- unrelated teacher cannot read that student
- ordinary authenticated user cannot write mastery, events, mappings, parameters, runs, or rollouts
- admin coverage endpoints reject student/teacher roles
- restricted functions are not executable by `anon`

## 3. Golden BKT calculations

Run focused tests:

```bash
npm test -- src/lib/bkt/calculation.test.ts
```

Required MCQ fixtures:

```text
prior 0.30 + correct   -> posterior 0.6067415730 -> result 0.6460674157
prior 0.30 + incorrect -> posterior 0.0540540541 -> result 0.1486486486
```

Run the SQL conformance test against the same fixtures. TypeScript and database values must differ by <0.001 for every sequence.

## 4. Attempt integration and idempotency

### MCQ

1. Save a mapped MCQ and publish it in the preview bank.
2. Submit an incorrect selected option while sending a deliberately wrong client `isCorrect=true` value.
3. Confirm the server stores `is_correct=false` from authoritative question content.
4. Confirm one mastery event and one current-state update.
5. Retry the same `client_attempt_id`.
6. Confirm no second attempt/event/state change.

### SAQ

1. Save a three-part item mapped `A2 / A3 / A2`.
2. Submit Part A incorrect, retry Part A correct, then Parts B/C.
3. Confirm every scored part attempt creates one event.
4. Confirm A2 receives Part A attempt 1, Part A attempt 2, and Part C in scoring order.
5. Confirm the question-level `attempts` summary creates no duplicate BKT event.

### Concurrency/replay

1. Submit two different attempts for the same student/KC concurrently.
2. Confirm both events exist and current state equals a serial replay.
3. Insert an older answered-at source after a newer source.
4. Confirm replay produces the chronological final state.
5. Correct one source outcome and confirm final state equals a clean sequence containing only final outcomes.

## 5. Adaptive selection

Seed one enabled test standard with five active KCs and at least two accessible questions per KC, including overlapping SAQs.

Verify:

1. First selections follow KC catalog order for unseen KCs.
2. A selected SAQ may mark several KCs observed because each part creates evidence.
3. After first pass, cycle positions 0/1 select highest-probability unmastered KCs; position 2 selects least-recently-served unmastered KC.
4. No target KC appears three times consecutively when an alternative has an eligible item.
5. A mastered KC (`>=0.95`) is absent from target candidates.
6. An unseen target's question ranks before answered questions.
7. For target A2, every selected SAQ contains A2 in at least one part.
8. Among equivalent unseen A2 SAQs, the item covering more distinct additional unmastered KCs wins.
9. Repeated A2 parts alone do not improve rank.
10. No A2 item records a coverage gap and falls through; it does not present an unrelated item as A2.
11. Two tabs requesting concurrently cause one compare-and-record retry rather than consuming the same rotation version.

Multi-standard scope:

- unseen KCs follow requested standard order then KC order
- after first pass, eligible standards alternate by least recent selection
- each standard retains its own 2+1 cycle state

## 6. Fixed-mode regression

Verify unchanged behavior:

- Exam uses its fixed blueprint/question count and does not call `/api/practice/next`.
- Review uses existing mistake/bookmark/spacing rules and does not call the adaptive selector.
- Assignment snapshots keep their stored order and resume behavior.
- Correctly mapped Exam and Review responses still create BKT events.
- Unresolved questions may persist in allowed fixed modes but create no BKT event.

## 7. Legacy classification preview

Run only against the non-production project first:

```bash
npm run bkt:classify -- --sample 24 --self-practice
```

Confirm output includes:

- targeted/completed/agreed/unresolved/error counts
- input and output token use per model and total
- run ID for resume
- `Active mappings changed: 0`

Inspect every sample decision for:

- same-standard KC
- direct assessment alignment, not incidental vocabulary
- ambiguous multi-KC MCQ marked unresolved rather than forced
- concise rationale
- classifier A/B isolation

Resume after an intentionally interrupted run:

```bash
npm run bkt:classify -- --resume <run-id>
```

Confirm completed decisions are not called or inserted again.

Do not proceed to bulk classification if the sample has unacceptable semantic errors, unexpected token use, or schema failures. Adjust/version the prompt and create a new run instead of rewriting the old one.

## 8. Publish and rollback rehearsal

Publish the preview run only in the non-production project:

```bash
npm run bkt:publish -- --run <run-id> --actor <admin-profile-uuid>
npm run bkt:coverage -- --standards 3.1.9-12.A
```

Confirm:

- only same-KC two-pass agreements publish
- changed content becomes stale/unresolved
- disagreement/error decisions remain unmapped
- repeated publish is idempotent
- affected standard remains disabled until validation and explicit enable
- enabling fails if any active KC has no eligible item

Rollback:

```bash
npm run bkt:rollback -- --run <run-id> --actor <admin-profile-uuid>
```

Confirm mappings close rather than delete, run becomes `rolled_back`, affected standards disable, question payloads remain unchanged, and repeated rollback is harmless.

## 9. Admin UI

At `/content/kc-coverage`, verify at 360px, Chromebook width, and desktop:

- Coverage, Runs, and Exceptions views are keyboard reachable
- filters and counts match read-only CLI inventory
- Preview/Publish/Roll Back/Enable/Disable have clear English labels
- destructive/activation actions require confirmation
- students and teachers receive `403`/appropriate navigation gating
- no student names, responses, scores, or mastery appear

## 10. Bundled bank retirement

Verify repository and runtime:

```bash
rg 'questions\.json|question-sets\.json|getStaticQuestions|initial-question-bank' src scripts
npm run build
```

Expected: no active import or fallback reference, and production build passes. With remote content unavailable, the app shows the existing English no-questions/configuration state rather than bundled questions.

## 11. Production rollout order

After approval of preview evidence and migration review:

1. Deploy schema/code with all standard rollouts disabled.
2. Run a current read-only inventory.
3. Run a new 20+ item production preview; publish nothing.
4. Review agreement, semantic sample, and usage.
5. Classify current Self Practice questions in staged standard groups.
6. Publish one standard, validate coverage hash, then enable it explicitly.
7. Monitor selection errors, coverage gaps, p95 latency, and mastery-event failures through a classroom-sized test.
8. Expand to more standards.
9. Classify non-adaptive legacy questions only after Self Practice is stable.

## Capacity note

- Student hot path adds one no-store server request per selected Practice item and one short database trigger per mapped response.
- BKT update has no LLM/network dependency beyond existing Supabase access.
- Candidate queries use `(kc_code, active, question_id)`, mastery PK, and recent-selection indexes; no JSON bank scan or N+1 query.
- Legacy classification is rate-limited to three batches/provider, resumable, and never runs inside a student request.
