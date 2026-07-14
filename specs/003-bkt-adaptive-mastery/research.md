# Research: BKT Adaptive Mastery

**Feature**: `003-bkt-adaptive-mastery` | **Date**: 2026-07-11

## R1. Separate parameter fitting from online mastery updates

**Decision**: Keep parameter fitting outside the request path. Version 1 stores approved shared parameters and performs only deterministic per-response BKT updates in the application/database runtime. Python and pyBKT remain optional analyst tools for future offline fitting and conformance fixtures; they are not application dependencies.

**Rationale**: pyBKT is designed for fitting, prediction, evaluation, and cross-validation over response sequences. A single online update is only the standard posterior calculation plus the learning transition. Adding a continuously deployed Python service would add a network hop, authentication boundary, deployment target, and failure mode without adding value to that calculation. OATutor provides a relevant precedent: its online BKT update is implemented directly in JavaScript while offline computation is separated. Sources: [pyBKT paper](https://arxiv.org/abs/2105.00385), [pyBKT repository](https://github.com/CAHLR/pyBKT), [OATutor](https://github.com/CAHLR/OATutor).

**Alternatives considered**:

- Run pyBKT for every answer: rejected because fitting functionality is unnecessary online and a second runtime complicates atomic persistence.
- Fit parameters continuously per student: rejected for version 1 because sparse individual histories yield unstable estimates and the approved cold-start design intentionally shares parameters.
- Compute mastery in the browser: rejected because authoritative learning state must survive retries, multiple devices, and deliberate client tampering.

## R2. Use standard no-forgetting BKT for version 1

**Decision**: Activate two shared parameter sets: MCQ (`P(L0)=0.30`, `P(T)=0.10`, `P(S)=0.10`, `P(G)=0.25`, `P(F)=0`) and SAQ (`P(L0)=0.30`, `P(T)=0.10`, `P(S)=0.10`, `P(G)=0.10`, `P(F)=0`), both with mastery threshold `0.95`.

**Rationale**: The historical standard-level fit with `P(F)=0.142..0.298` cannot be combined with a `0.95` post-transition mastery threshold: a forgetting transition bounds the next state below `1-P(F)`, and repeated correct responses converge below the requested threshold for the supplied values. The fit also used standard-level interactions while the new system models finer-grained KCs, so the fitted forgetting parameter may absorb within-standard KC heterogeneity, item difficulty, and time gaps. Standard BKT assumes no forgetting. Research that adds forgetting conditions it on elapsed time/new-day transitions rather than applying a large constant at every same-session opportunity. Sources: [pyBKT paper](https://arxiv.org/abs/2105.00385), [Does Time Matter?](https://web.cs.wpi.edu/~nth/pubs_and_grants/papers/2011/EDM%202011/Qiu%20Does%20Time%20Matter.pdf).

**Alternatives considered**:

- Use the historical standard-level `P(F)` values directly: rejected because mastery would be unreachable and a correct response can reduce stored mastery.
- Lower the mastery threshold per standard: rejected because it changes the product definition to accommodate a non-transferable fit.
- Add time-conditioned forgetting now: deferred until KC-tagged longitudinal data can compare no-forgetting and elapsed-time models by cross-validation and calibration.

## R3. Make the database observation application atomic

**Decision**: Apply each accepted observation through a Postgres function invoked by insert triggers on `attempts` (MCQ only) and `short_answer_attempts` (part attempts). The function deduplicates by source attempt, locks the student's KC state, appends an immutable mastery event, and updates the current state in one transaction. Out-of-order inserts and rescoring invoke deterministic replay for the affected student/KC.

**Rationale**: A Node read-calculate-write sequence can lose updates when two devices or requests answer concurrently. PostgreSQL `SELECT ... FOR UPDATE` locks selected rows against concurrent updates, and Supabase recommends database functions for data-intensive transactional work exposed through its API. A trigger also ensures every persisted eligible attempt follows the same path, including offline-sync retries and SAQ grading. Sources: [PostgreSQL locking clauses](https://www.postgresql.org/docs/18/sql-select.html), [Supabase database functions](https://supabase.com/docs/guides/database/functions).

**Alternatives considered**:

- Update mastery in the route handler after inserting an attempt: rejected because the two writes are not one transaction and can leave a recorded attempt without mastery evidence.
- Optimistic compare-and-swap from TypeScript: viable but rejected because it requires retry orchestration in every attempt-writing route and still duplicates persistence rules.
- Recompute every student/KC from all attempts on every request: rejected as unnecessary hot-path work; replay is reserved for out-of-order or corrected evidence.

## R4. Keep a TypeScript reference calculator

**Decision**: Implement the same BKT formula as a pure TypeScript utility for unit tests, fixtures, previews, and explanation, while the database function is authoritative for persisted updates. Maintain shared golden fixtures covering correct, incorrect, repeated, duplicate, and out-of-order sequences.

**Rationale**: The app needs easily testable domain logic and the database needs transaction safety. Golden conformance tests control the risk of duplicating a small formula across TypeScript and SQL and can later include pyBKT-generated sequences.

**Alternatives considered**:

- Put the formula only in SQL: rejected because selection simulations and focused unit tests would be harder.
- Put the formula only in TypeScript: rejected because atomic state/event persistence would require a more complex compare-and-swap protocol.

## R5. Normalize KC mappings for selection and audit

**Decision**: Add an indexed `question_kc_assignments` relation as the operational source for adaptive selection. Preserve KC metadata in question payloads for content portability, but synchronize generated/edited payload mappings into the relation and snapshot the assignment ID on every mastery event.

**Rationale**: MCQs have one KC and SAQs have one KC per part. Searching and joining by KC across 905+ JSON payloads on every next-question request is less explicit, harder to constrain, and harder to version than an indexed relation. Immutable assignment versions prevent later content edits from rewriting the meaning of historical evidence.

**Alternatives considered**:

- Query only `payload.kcCode` and `shortAnswer.blueprint.taskSequence`: rejected for hot-path selection and history/versioning.
- Move all KC data out of payload JSON: rejected because question export, preview, and the existing generation pipeline already use embedded KC metadata.
- Allow multiple MCQ mappings: rejected in version 1 because a binary item response cannot identify which required KC caused the outcome.

## R6. Synchronize new question mappings at the database boundary

**Decision**: A database trigger validates question content on insert/update and synchronizes content-provided mappings. Self Practice publication is rejected when an MCQ lacks one valid same-standard KC or an SAQ part lacks one. Editing content invalidates an active model-confirmed legacy mapping when its source-content hash changes.

**Rationale**: Question writes currently occur from several paths, including browser storage helpers and assignment-set creation. Central validation prevents one path from bypassing KC requirements and avoids an immediate broad rewrite of all content management flows.

**Alternatives considered**:

- Validate only in UI forms: rejected because imports, scripts, and route handlers can bypass the UI.
- Immediately move all writes behind a new server API: desirable longer term but larger than the BKT boundary needed here; the database trigger provides consistent enforcement now.

## R7. Use two independent, constrained LLM classifications

**Decision**: The legacy classifier runs two isolated classification passes per MCQ, defaulting to the existing cost-focused models `gpt-5.4-mini` and `gemini-3.1-flash-lite-preview` at temperature 0. Each pass receives the question, answer, explanation, standard, and only the active KC codes/statements for that standard. Outputs use a strict schema and are semantically validated. Neither pass sees the other's result.

**Rationale**: SME capacity is unavailable for 905 item-by-item reviews. Different providers reduce correlated implementation/model failure compared with repeating the same deterministic call. Restricting the output KC to an enum-like standard-local set eliminates cross-standard mappings. Both OpenAI and Gemini recommend schema-constrained structured output followed by application validation. Sources: [OpenAI Structured Outputs](https://platform.openai.com/docs/api-reference/evals/run-output-item-object?lang=node), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output?lang=rest).

**Alternatives considered**:

- Trust one model's confidence score: rejected because self-reported confidence is not an independent validation signal.
- Use two identical temperature-0 calls: rejected because identical deterministic failures are likely to agree.
- Require human approval for every item: rejected because the user confirmed SME capacity is unavailable; disagreements remain excluded rather than guessed.

## R8. Separate preview, approval, publication, and rollback

**Decision**: Implement a resumable TypeScript migration CLI with `preview` as the default. Classification runs and decisions are auditable, but preview never changes active mappings. An explicit admin-authorized publish operation verifies two-pass agreement, current content hashes, and KC validity before creating mapping versions. Rollback closes mappings created by that run and disables affected standards until coverage is revalidated.

**Rationale**: Production writes must not be an ad hoc agent/SQL action. A versioned tool makes cost measurable, supports partial retry, and allows the 20-item validation sample, 570 Self Practice items, and remaining items to be staged independently.

**Alternatives considered**:

- Let an agent directly update payload JSON: rejected because it is difficult to reproduce, audit, resume, and roll back.
- Build a full interactive labeling UI before migration: rejected as unnecessary for the high-agreement bulk path; the admin coverage view focuses on status and exceptions.
- Publish automatically after each LLM response: rejected because partial runs would silently change the active adaptive bank.

## R9. Select questions server-side, one decision at a time

**Decision**: Replace client-side shuffle for self-practice with an authenticated next-question endpoint. The server selects a target KC, queries accessible mapped questions, applies deterministic MCQ/SAQ ranking, records the decision, and returns one question. Exam, Review, and assignment snapshots retain their current fixed selection behavior.

**Rationale**: Adaptive selection depends on authoritative mastery, recent exposure, first-pass state, content access, and rotation state. Returning one decision at a time lets the next answer immediately affect selection and avoids stale client snapshots. A compare-and-record database function uses a rotation-state version so two tabs cannot silently consume the same cycle slot.

**Alternatives considered**:

- Download mastery and the whole bank and select in the browser: rejected for tamper resistance, cross-device consistency, and stale state.
- Build the whole practice session at start: rejected because it cannot adapt after each response.
- Change Review and Exam to use the same endpoint: rejected by the feature boundary; those modes update BKT but keep existing selectors.

## R10. Resolve mixed MCQ/SAQ banks without a new format quota

**Decision**: Target-KC selection considers all eligible items already present in the caller's practice scope. Common ordering is unseen then least recently answered. MCQ and SAQ do not receive a new fixed quota in version 1; the SAQ additional-unmastered-KC criterion is used only to rank SAQs against other SAQs at the same common rank.

**Rationale**: The current product does not expose a separate format policy, and the specification does not request one. This preserves the composition of the published bank while making KC selection adaptive. Format exposure is recorded so a later policy can be evaluated.

**Alternatives considered**:

- Alternate MCQ and SAQ 1:1: rejected because standards may not have balanced banks.
- Always prefer SAQ for its multiple KC coverage: rejected because it would change workload and over-weight correlated evidence.
- Always prefer MCQ: rejected because it would starve valid SAQ content.

## R11. Retire the bundled initial bank completely

**Decision**: Remove `src/data/questions.json`, its initial set metadata, static imports/getters, and the obsolete glossary migration script dependency. Missing remote content uses the existing English empty/configuration state.

**Rationale**: Authenticated students already use only Supabase Self Practice content. The static bank currently remains in teacher/admin aggregation and no-Supabase fallback, creating a second ungoverned content source without KC assignments.

**Alternatives considered**:

- Add KC mappings to the 15 bundled questions: rejected because the user confirmed they existed only as an initial fallback and are no longer needed.
- Keep them as hidden test fixtures: rejected because dedicated typed fixtures are clearer and cannot leak into production aggregation.

## R12. Gate rollout per standard

**Decision**: Store an explicit per-standard rollout state. A standard can enter adaptive mode only after all Self Practice candidates are either actively mapped or deliberately excluded and every active KC intended for practice has usable question coverage. Start with a 20+ item preview, then Self Practice questions (570 at the 2026-07-10 inventory), then non-adaptive questions.

**Rationale**: A partial global rollout would make missing mappings look like student mastery or cause selector dead ends. Per-standard gates allow useful standards to launch without waiting for all 905 legacy MCQs.

**Alternatives considered**:

- Enable BKT globally as mappings arrive: rejected because coverage would vary silently by standard.
- Require all 905 questions before any launch: rejected because it delays value and makes rollback unnecessarily broad.

## R13. Preserve multi-standard Self Practice scopes

**Decision**: The next-question request accepts an ordered set of selected standard IDs. Across that scope, unseen KCs are served in standard order then KC catalog order. After the scope has no unseen eligible KC, choose the least recently served eligible standard, then apply that standard's persisted two-priority/one-rotation KC cycle.

**Rationale**: The existing Self Practice planner allows multiple topic/category selections, which resolve to multiple standards. Restricting BKT Practice to one standard would regress that workflow. Standard-level interleaving prevents one large or nearly mastered standard from consuming the entire session while preserving the specified within-standard selector.

**Alternatives considered**:

- Treat every KC across all selected standards as one global ranked pool: rejected because standards with more KCs dominate and the per-standard first-pass/completion semantics become harder to explain.
- Finish one standard before moving to the next: rejected because it blocks interleaving across the student's selected scope.
- Restrict the planner to one standard: rejected as an unnecessary product regression.
