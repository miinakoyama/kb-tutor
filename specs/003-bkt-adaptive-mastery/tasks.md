# Tasks: BKT Adaptive Mastery

**Input**: Design documents from `/specs/003-bkt-adaptive-mastery/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Tests are required because the specification defines calculation, idempotency, selection, authorization, regression, and audit success criteria. Test tasks precede their corresponding implementation tasks.

**Organization**: Tasks are grouped by user story so each increment can be implemented and verified at its checkpoint. Production classification and rollout remain explicit operator actions after implementation verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on another incomplete task in the same phase
- **[Story]**: Maps the task to a user story in `spec.md`
- Every task names the exact file or directory it changes

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish feature-owned types, fixtures, and operator entry points without adding a Python runtime or npm dependency.

- [ ] T001 Create the BKT, KC mapping, classification, rollout, mastery event, and adaptive selection TypeScript types in `src/types/bkt.ts`
- [ ] T002 [P] Create the approved MCQ/SAQ golden response sequences and expected probabilities in `src/lib/bkt/fixtures.ts`
- [ ] T003 Add `bkt:classify`, `bkt:publish`, `bkt:rollback`, and `bkt:coverage` operator script entries to `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the governed KC catalog and versioned operational mappings that every user story relies on.

**CRITICAL**: No user story implementation starts until this phase passes its migration and mapping checks.

- [ ] T004 Create the `knowledge_components` and versioned `question_kc_assignments` schema, constraints, indexes, restricted grants, and RLS policies in `supabase/migrations/20260711000000_bkt_catalog_mappings.sql`
- [ ] T005 Seed the authoritative ordered Keystone Biology KC catalog from the existing SAQ catalog and validate standard membership in `supabase/migrations/20260711000000_bkt_catalog_mappings.sql`
- [ ] T006 Implement question-content hashing plus MCQ and SAQ-part mapping synchronization, stale-mapping invalidation, and same-standard validation triggers in `supabase/migrations/20260711000000_bkt_catalog_mappings.sql`
- [ ] T007 [P] Implement authoritative KC catalog reads and standard/code validation in `src/lib/bkt/kc-catalog.ts`
- [ ] T008 [P] Implement payload-to-assignment parsing, content hashing, and MCQ/SAQ mapping guards in `src/lib/bkt/mappings.ts`
- [ ] T009 Add pgTAP coverage for KC uniqueness/order, mapping cardinality, same-standard enforcement, content-hash invalidation, grants, and RLS in `supabase/tests/bkt_catalog_mappings.sql`

**Checkpoint**: The database rejects invalid mappings, synchronizes valid new content, and exposes no privileged mapping writes to ordinary users.

---

## Phase 3: User Story 1 - Build Trustworthy KC Coverage (Priority: P1)

**Goal**: Give administrators an auditable, reversible way to inventory KC coverage, classify legacy MCQs twice, publish only matching valid decisions, and gate adaptive rollout per standard.

**Independent Test**: Load tagged, untagged, invalid, stale, and multi-part questions; verify coverage states, two isolated decisions, preview non-writing behavior, explicit publication, rollback, and per-standard activation blocking.

### Tests for User Story 1

- [ ] T010 [P] [US1] Write failing unit tests for coverage-state derivation, source/format/standard grouping, and activation blockers in `src/lib/bkt/coverage.test.ts`
- [ ] T011 [P] [US1] Write failing unit tests for strict classifier parsing, standard-local semantic validation, model isolation, retry classification, and usage aggregation in `scripts/bkt/classify-legacy-kcs.test.ts`
- [ ] T012 [P] [US1] Write failing route tests for admin authentication, role checks, coverage filtering, publish, rollback, and enable/disable commands in `src/app/api/admin/kc-coverage/route.test.ts`
- [ ] T013 [P] [US1] Write failing component tests for Coverage, Runs, Exceptions, confirmation, and English status states in `src/app/content/kc-coverage/page.test.tsx`
- [ ] T014 [P] [US1] Write failing generation/edit validation tests for required MCQ KC and per-part SAQ KC mappings in `src/lib/bkt/mappings.test.ts`

### Implementation for User Story 1

- [ ] T015 [US1] Create classification run/decision tables, coverage view, rollout table, publish/rollback functions, indexes, grants, and RLS in `supabase/migrations/20260711000300_bkt_classification.sql`
- [ ] T016 [US1] Add pgTAP tests for preview non-mutation, matching-decision publication, disagreement rejection, idempotent resume/publish, rollback, stale hashes, and per-standard activation in `supabase/tests/bkt_classification.sql`
- [ ] T017 [P] [US1] Implement coverage aggregation and activation preflight evaluation in `src/lib/bkt/coverage.ts`
- [ ] T018 [P] [US1] Extend structured-output validation and per-model token usage reporting for classification in `src/lib/llm/client.ts`
- [ ] T019 [US1] Implement the resumable two-model, standard-batched, preview-by-default classifier with bounded concurrency and no student data in `scripts/bkt/classify-legacy-kcs.ts`
- [ ] T020 [P] [US1] Implement read-only inventory and rollout preflight output in `scripts/bkt/verify-kc-coverage.ts`
- [ ] T021 [US1] Implement explicit admin-authorized publish and rollback CLI wrappers in `scripts/bkt/publish-kc-run.ts`
- [ ] T022 [P] [US1] Implement the authenticated admin coverage/run/exception read API in `src/app/api/admin/kc-coverage/route.ts`
- [ ] T023 [US1] Implement authenticated admin publish, rollback, enable, and disable commands with confirmation tokens in `src/app/api/admin/kc-coverage/publish/route.ts`
- [ ] T024 [US1] Build the responsive English Coverage, Runs, and Exceptions administration view in `src/app/content/kc-coverage/page.tsx`
- [ ] T025 [P] [US1] Require and validate one same-standard KC on generated or edited MCQs in `src/app/api/generate-questions/route.ts`
- [ ] T026 [P] [US1] Require and validate one same-standard KC per scored SAQ part in `src/lib/short-answer/item-schema.ts`
- [ ] T027 [US1] Synchronize mass-produced SAQ part mappings through the governed publication path in `src/app/content/mass-production/page.tsx`
- [ ] T028 [US1] After explicit operator approval of the estimated LLM cost, run a non-production preview of at least 20 representative legacy MCQs without publishing and record agreement, invalid cases, schema failures, models, prompt versions, and measured usage in `specs/003-bkt-adaptive-mastery/validation/classification-sample.md`

**Checkpoint**: Only confirmed current mappings are adaptive-eligible; unresolved items stay excluded; no production publication occurs without a later explicit operator approval.

---

## Phase 4: User Story 2 - Maintain Student Mastery from Responses (Priority: P1)

**Goal**: Apply versioned, no-forgetting BKT exactly once for each finalized mapped MCQ or SAQ-part response in Practice, Exam, and Review.

**Independent Test**: Submit known correct/incorrect sequences, duplicates, retries, concurrent attempts, out-of-order evidence, and rescoring; verify current state and immutable history reproduce the final accepted evidence within 0.001.

### Tests for User Story 2

- [ ] T029 [P] [US2] Write failing unit tests for conditioning, learning transition, clamping, threshold reversal, and at least 100 MCQ/SAQ golden sequences in `src/lib/bkt/calculation.test.ts`
- [ ] T030 [P] [US2] Extend MCQ attempt route tests to reject client-authoritative correctness and cover duplicate mapped/unmapped observations in `src/app/api/analytics/attempts/route.test.ts`
- [ ] T031 [P] [US2] Extend SAQ grading route tests for full-credit correctness, partial-credit incorrectness, retries, repeated KCs, and no summary-row duplication in `src/app/api/short-answer/grade/route.test.ts`
- [ ] T032 [P] [US2] Write pgTAP tests for parameter activation, lazy prior initialization, atomic locking, deduplication, chronological replay, rescoring, audit snapshots, grants, and mastery RLS in `supabase/tests/bkt_mastery.sql`

### Implementation for User Story 2

- [ ] T033 [P] [US2] Implement the pure standard no-forgetting BKT calculation, replay, and threshold helpers in `src/lib/bkt/calculation.ts`
- [ ] T034 [US2] Create versioned `bkt_parameter_sets`, `student_kc_mastery`, and append-only `bkt_mastery_events` with v1 MCQ/SAQ seeds, indexes, grants, and RLS in `supabase/migrations/20260711000100_bkt_parameters_mastery.sql`
- [ ] T035 [US2] Implement atomic `apply_bkt_observation` and deterministic `rebuild_student_kc_mastery` functions with row locking and source-attempt idempotency in `supabase/migrations/20260711000100_bkt_parameters_mastery.sql`
- [ ] T036 [US2] Attach mapped MCQ and scored SAQ-part observation triggers while excluding unmapped questions and question-level SAQ summaries in `supabase/migrations/20260711000100_bkt_parameters_mastery.sql`
- [ ] T037 [P] [US2] Implement active parameter resolution and version metadata guards in `src/lib/bkt/parameters.ts`
- [ ] T038 [US2] Recompute MCQ correctness from authorized question or assignment snapshot data before attempt persistence in `src/app/api/analytics/attempts/route.ts`
- [ ] T039 [US2] Persist stable SAQ part attempt identities, final binary outcomes, scoring order, and correction metadata needed by the observation trigger in `src/app/api/short-answer/grade/route.ts`
- [ ] T040 [US2] Run the TypeScript and pgTAP golden suites and document <0.001 conformance, concurrent replay, and duplicate/rescore results in `specs/003-bkt-adaptive-mastery/validation/mastery-conformance.md`

**Checkpoint**: Every finalized mapped response creates exactly the expected reproducible mastery transition; unmapped content creates none.

---

## Phase 5: User Story 3 - Receive Adaptive MCQ Practice (Priority: P1)

**Goal**: Serve mapped MCQs one at a time using persistent first-pass order, the deterministic two-priority/one-rotation policy, mastery retirement, and bounded coverage-gap fallback.

**Independent Test**: With five KCs and known mastery/history, verify first pass, resume, 2+1 rotation, two-consecutive cap, weak-KC rotation, question recency, multi-standard interleaving, retirement/re-entry, and complete-versus-unavailable outcomes.

### Tests for User Story 3

- [ ] T041 [P] [US3] Write failing selector tests for first pass, resume, priority/rotation lanes, deterministic ties, weak-KC fairness, consecutive cap, missing candidates, and multi-standard scope in `src/lib/bkt/selection.test.ts`
- [ ] T042 [P] [US3] Write failing authenticated route tests for selected, complete, unavailable, inaccessible scope, rollout disabled, and rotation-conflict retry responses in `src/app/api/practice/next/route.test.ts`
- [ ] T043 [P] [US3] Extend component tests for one-at-a-time fetch, answer-then-next flow, session limits, resume, completion, coverage gaps, and English retry states in `src/components/modes/AdaptivePracticeMode.test.tsx`
- [ ] T044 [P] [US3] Write pgTAP tests for rollout fail-closed behavior, rotation compare-and-record concurrency, selection-event audit snapshots, and selection RLS in `supabase/tests/bkt_adaptive_selection.sql`

### Implementation for User Story 3

- [ ] T045 [US3] Create `adaptive_rotation_states`, `adaptive_selection_events`, rollout validation support, indexes, restricted functions, and RLS in `supabase/migrations/20260711000200_bkt_adaptive_selection.sql`
- [ ] T046 [US3] Implement the pure first-pass, multi-standard, two-priority/one-rotation, consecutive-cap, and bounded KC fallback policy in `src/lib/bkt/selection.ts`
- [ ] T047 [P] [US3] Add an indexed adaptive-eligible mapped-question query with student access, attempt recency, and no JSON bank scan in `src/lib/school-generated-questions.ts`
- [ ] T048 [US3] Implement authenticated server-side selection, no-store responses, decision audit context, and two bounded rotation-version retries in `src/app/api/practice/next/route.ts`
- [ ] T049 [US3] Convert Self Practice from upfront client shuffle to one-at-a-time adaptive retrieval while preserving the existing bounded session count in `src/components/modes/AdaptivePracticeMode.tsx`
- [ ] T050 [US3] Update Self Practice question loading to retain ordered standard scope and remove adaptive client-side fallback ordering in `src/hooks/useQuestions.ts`
- [ ] T051 [US3] Add Playwright coverage for first-pass continuity across reload/device-sized viewports, post-pass rotation, mastered completion, and mapped-content unavailable states in `tests/e2e/bkt-adaptive-mcq.spec.ts`

**Checkpoint**: Adaptive MCQ Practice is independently usable for an enabled, fully covered standard and never treats a coverage gap as mastery.

---

## Phase 6: User Story 4 - Practice Multi-KC Short Answers (Priority: P1)

**Goal**: Select only banked SAQs containing the target KC, use other distinct unmastered part KCs as a tie breaker, and preserve one observation per scored part.

**Independent Test**: For every target position in two- and three-part SAQs, verify every selected item contains the target, repeated target parts gain no artificial priority, each part updates its own KC, and missing-target fallback records a gap before trying the next KC.

### Tests for User Story 4

- [ ] T052 [P] [US4] Write failing SAQ selector tests for target containment, unseen preference, distinct additional-unmastered coverage, repeated-target neutrality, recency, all-parts-mastered exclusion, and next-KC fallback in `src/lib/bkt/selection-saq.test.ts`
- [ ] T053 [P] [US4] Extend next-question route tests for two/three-part target positions, targetless gap events, mixed MCQ/SAQ banks, and standard completion in `src/app/api/practice/next/route.test.ts`
- [ ] T054 [P] [US4] Add component tests for presenting a selected banked SAQ and requesting the next item only after all scored parts finalize in `src/components/modes/AdaptivePracticeMode.test.tsx`

### Implementation for User Story 4

- [ ] T055 [US4] Extend candidate ranking with SAQ target containment, distinct additional-unmastered KC count, repeated-target neutrality, and all-parts-mastered exclusion in `src/lib/bkt/selection.ts`
- [ ] T056 [US4] Extend the indexed candidate query to return validated part-level assignments and distinct active part KCs for eligible SAQs in `src/lib/school-generated-questions.ts`
- [ ] T057 [US4] Record SAQ target-KC coverage gaps and continue through the same lane's remaining KC order without consuming the rotation opportunity in `src/app/api/practice/next/route.ts`
- [ ] T058 [US4] Integrate banked SAQ rendering, per-part finalization, and next-question retrieval into adaptive sessions in `src/components/modes/AdaptivePracticeMode.tsx`
- [ ] T059 [US4] Add Playwright coverage for overlapping SAQ mappings, repeated target KCs, part-specific mastery events, and missing-target fallback in `tests/e2e/bkt-adaptive-saq.spec.ts`

**Checkpoint**: Every target-labeled SAQ contains that KC, and selection cause never changes which KC receives each part's evidence.

---

## Phase 7: User Story 5 - Preserve Exam and Review Workflows (Priority: P2)

**Goal**: Keep Exam blueprint and Review scheduling behavior unchanged while their mapped finalized responses update BKT for later Practice.

**Independent Test**: Compare fixed Exam and Review selection snapshots before and after BKT, verify empty Review filters render safely, and confirm mapped outcomes update mastery without either mode calling the adaptive endpoint.

### Tests for User Story 5

- [ ] T060 [P] [US5] Extend Exam regression tests to assert fixed blueprint output, no adaptive endpoint calls, and mapped/unmapped BKT evidence behavior in `src/components/modes/ExamMode.test.tsx`
- [ ] T061 [P] [US5] Add Review regression tests for existing spacing, mistake, bookmark, randomization, mastery-independent inclusion, and all-empty English states in `src/components/modes/ReviewMode.test.tsx`
- [ ] T062 [P] [US5] Extend attempt integration tests to prove mapped Exam/Review outcomes update mastery and unresolved fixed-mode questions do not in `src/app/api/analytics/attempts/route.test.ts`

### Implementation for User Story 5

- [ ] T063 [US5] Preserve fixed Exam assembly and pass finalized mapped response mode metadata through the existing attempt path in `src/components/modes/ExamMode.tsx`
- [ ] T064 [US5] Preserve Review queue/filter/spacing behavior, emit finalized mapped re-attempts, and render an English all-empty state in `src/components/modes/ReviewMode.tsx`
- [ ] T065 [US5] Add Playwright regression coverage for unchanged Exam/Review selection plus later Practice reprioritization from their outcomes in `tests/e2e/bkt-fixed-modes.spec.ts`

**Checkpoint**: Exam and Review choose the same questions as before BKT; only their scored evidence affects future mastery and Practice.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Retire obsolete fallback content, harden security/performance, and complete staged rollout verification.

- [ ] T066 [P] Remove bundled fallback imports, static migration behavior, and initial-bank helpers while retaining deliberate English empty/configuration states in `src/lib/question-storage.ts`
- [ ] T067 [P] Remove the bundled initial question bank and its set metadata from `src/data/questions.json` and `src/data/question-sets.json`
- [ ] T068 [P] Delete the obsolete bundled-bank glossary migration workflow in `scripts/migrate-glossary.js`
- [ ] T069 Remove the Initial Question Bank content-management branch and verify remote-only empty states in `src/app/content/questions/[setId]/page.tsx`
- [ ] T070 [P] Add tests proving no active student, educator, content-management, or fallback flow loads bundled questions in `src/lib/question-storage.test.ts`
- [ ] T071 [P] Add a classroom-burst selection/observation performance harness and p95 assertions for the 500ms targets in `scripts/bkt/benchmark.ts` and expose it through `package.json`
- [ ] T072 Audit all BKT migrations and route handlers for fixed `search_path`, revoked default function execution, service-role isolation, `getUser()` revalidation, profile role checks, and school-scoped mastery access in `supabase/tests/bkt_security.sql`
- [ ] T073 Run `npm run lint`, `npm test`, focused pgTAP suites, `npm run test:e2e:smoke`, `npm run build`, and the retirement `rg` check, then record commands and results in `specs/003-bkt-adaptive-mastery/validation/implementation-verification.md`
- [ ] T074 After explicit operator approval, rehearse publish, idempotent republish, rollback, coverage preflight, and one-standard enable in a non-production project and record results in `specs/003-bkt-adaptive-mastery/validation/rollout-rehearsal.md`
- [ ] T075 Document the production runbook with disabled-by-default deployment, fresh 20+ preview, Self Practice-first staged classification, per-standard approval, monitoring, rollback, and stop conditions in `specs/003-bkt-adaptive-mastery/production-runbook.md`
- [ ] T076 Reproduce a 200-event mastery audit sample and a 200-decision adaptive selection sample from stored version snapshots and record discrepancies in `specs/003-bkt-adaptive-mastery/validation/audit-reproducibility.md`
- [ ] T077 Conduct representative student acceptance sessions for adaptive Practice, measure session completion and confusing repetition against the 90% criterion, and record findings in `specs/003-bkt-adaptive-mastery/validation/student-acceptance.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all user stories.
- **US1 (Phase 3)**: Starts after Phase 2; establishes coverage governance and rollout gates required before adaptive production use.
- **US2 (Phase 4)**: Starts after Phase 2 and can be developed in parallel with US1, but enabled observations require confirmed mappings from US1.
- **US3 (Phase 5)**: Depends on Phase 2 and US2 mastery state; production enablement also depends on the relevant standard passing US1 coverage.
- **US4 (Phase 6)**: Depends on US2 observation handling and the common selector/API created by US3.
- **US5 (Phase 7)**: Depends on US2 observation handling; its regression tests can start in parallel with US3/US4.
- **Phase 8 (Polish)**: Starts after the desired user stories are complete. T074 additionally depends on T028, T040, T051, T059, T065, T072, and T073; T076-T077 depend on a successful non-production rollout rehearsal.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 (coverage/classification) ---------> rollout approval
                    -> US2 (mastery) -> US3 (adaptive MCQ) -> US4 (adaptive SAQ)
                                     -> US5 (Exam/Review preservation)
US1 coverage gate + US2/US3/US4 verification ----------------> staged enablement
```

### Within Each User Story

- Write the listed tests first and confirm they fail for the intended behavior.
- Apply schema/entities before database-backed services and endpoints.
- Implement pure rules before route/UI integration.
- Complete the independent-test checkpoint before starting rollout work.
- Never run classification in production or enable a standard as an implicit part of a code task.

### Parallel Opportunities

- T002 can run beside T001; T007 and T008 can run in parallel after the catalog schema contract is known.
- US1 test tasks T010-T014 can run together; T017, T018, T020, T022, T025, and T026 touch separate files.
- US2 test tasks T029-T032 can run together; T033 and T037 are independent pure modules before route integration.
- US3 test tasks T041-T044 can run together; the query task T047 can run beside selector task T046.
- US4 test tasks T052-T054 can run together before the shared selector/API/component files are updated sequentially.
- US5 test tasks T060-T062 can run together and can begin while US3/US4 implementation proceeds.
- Cleanup tasks T066-T068 and performance/security preparations T071-T072 can run in parallel.

---

## Parallel Execution Examples

### User Story 1

```text
Task T010: coverage-state tests in src/lib/bkt/coverage.test.ts
Task T011: classifier tests in scripts/bkt/classify-legacy-kcs.test.ts
Task T012: admin API tests in src/app/api/admin/kc-coverage/route.test.ts
Task T013: admin UI tests in src/app/content/kc-coverage/page.test.tsx
Task T014: generation/edit mapping tests in src/lib/bkt/mappings.test.ts
```

### User Story 2

```text
Task T029: pure BKT golden tests in src/lib/bkt/calculation.test.ts
Task T030: MCQ attempt integration tests in src/app/api/analytics/attempts/route.test.ts
Task T031: SAQ grading integration tests in src/app/api/short-answer/grade/route.test.ts
Task T032: database atomicity/RLS tests in supabase/tests/bkt_mastery.sql
```

### User Story 3

```text
Task T041: selector policy tests in src/lib/bkt/selection.test.ts
Task T042: next-question contract tests in src/app/api/practice/next/route.test.ts
Task T043: adaptive component tests in src/components/modes/AdaptivePracticeMode.test.tsx
Task T044: rotation and selection audit tests in supabase/tests/bkt_adaptive_selection.sql
```

### User Story 4

```text
Task T052: SAQ ranking tests in src/lib/bkt/selection-saq.test.ts
Task T053: SAQ route contract tests in src/app/api/practice/next/route.test.ts
Task T054: SAQ adaptive component tests in src/components/modes/AdaptivePracticeMode.test.tsx
```

### User Story 5

```text
Task T060: Exam regression tests in src/components/modes/ExamMode.test.tsx
Task T061: Review regression tests in src/components/modes/ReviewMode.test.tsx
Task T062: fixed-mode evidence integration tests in src/app/api/analytics/attempts/route.test.ts
```

---

## Implementation Strategy

### MVP First

The smallest trustworthy learner-facing MVP is **Setup + Foundation + US1 + US2 + US3 for one fully covered standard**. US1 alone is independently valuable for content governance, but adaptive Practice must not ship until coverage, mastery, and MCQ selection all pass their checkpoints.

1. Complete Phase 1 and Phase 2.
2. Complete US1 and validate coverage without production publication.
3. Complete US2 and validate calculation/idempotency independently.
4. Complete US3 for one non-production standard.
5. Stop and validate the MCQ adaptive MVP before adding SAQ adaptivity or enabling production standards.

### Incremental Delivery

1. Ship schema/code with all standards disabled.
2. Add US1 coverage tooling and review a non-writing 20+ item sample.
3. Add US2 mastery writes and auditability without changing selection.
4. Add US3 MCQ adaptivity for a fully covered staged standard.
5. Add US4 banked multi-KC SAQ selection.
6. Complete US5 fixed-mode regression verification.
7. Retire bundled content, rehearse rollback, and enable standards one at a time only after approval.

### Rollout Safety

- Preview is always non-writing; classification results do not become mappings automatically.
- Publication, rollback, and standard enablement are separate explicit operations.
- A missing mapped question is a coverage limitation, never evidence of mastery.
- Production classification and rollout follow `production-runbook.md`, not `/speckit-implement` defaults.

## Notes

- `[P]` tasks operate on separate files or independent test surfaces at that point in the dependency graph.
- Task IDs are execution ordered; shared-file changes within a story are intentionally sequential.
- Tests must fail for the intended missing behavior before their implementation tasks begin.
- Commit after each task or cohesive task group; never mix production classification data changes into a code commit.
