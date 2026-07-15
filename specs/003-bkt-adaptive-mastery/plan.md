# Implementation Plan: BKT Adaptive Mastery

**Branch**: `003-bkt-adaptive-mastery` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-bkt-adaptive-mastery/spec.md`

**Note**: This plan stops after design and contracts. Executable implementation tasks are generated separately by `/speckit-tasks`.

## Summary

Add KC-governed Bayesian Knowledge Tracing to Practice, Exam, and Review while keeping Exam and Review selection unchanged. Version 1 uses shared no-forgetting parameter sets, an authoritative per-student/per-KC mastery state, immutable observation events, and a deterministic server-side Practice selector. Persisted attempt triggers apply BKT atomically so duplicate, concurrent, out-of-order, and corrected evidence cannot corrupt mastery.

Normalize MCQ and SAQ part mappings into an indexed, versioned relation. Newly generated content synchronizes valid embedded KC metadata automatically. A resumable two-model classification tool migrates the 905 legacy unmapped MCQs through preview, explicit publication, and rollback, starting with a 20+ item cost/quality sample and the 570 Self Practice items. Adaptive rollout is gated per standard. The obsolete 15-question bundled fallback bank is removed.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 22.x; PostgreSQL/PL/pgSQL on hosted Supabase

**Primary Dependencies**: Next.js 16.1 App Router, React 19.2, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), existing multi-provider LLM client (`openai`, `@anthropic-ai/sdk`, Gemini through the OpenAI-compatible endpoint). No Python runtime or new npm package.

**Storage**: Supabase Postgres. Existing `generated_questions`, `attempts`, `short_answer_attempts`, `analytics_sessions`, school membership, and assignment tables; new KC catalog, mapping/version, parameter, mastery/event, selection/rotation, classification-run/decision, and standard-rollout tables.

**Testing**: Vitest + jsdom for calculation, selection, mapping guards, route handlers, and classifier parsing; SQL migration/RPC tests for locking, idempotency, replay, RLS, and trigger behavior; Playwright smoke coverage for adaptive Practice and admin coverage states.

**Target Platform**: Existing Next.js deployment with hosted Supabase; student Chromebooks and mobile browsers at widths >=360px. The legacy classification CLI runs from a trusted maintainer environment or approved CI job.

**Project Type**: Single web application with server route handlers, browser UI, Postgres functions/triggers, and an operator CLI.

**Performance Goals**: p95 next-question response <=500ms and p95 answer persistence/mastery update <=500ms excluding existing SAQ grading latency; no LLM calls on student Practice/Exam/Review hot paths; one indexed candidate query and one atomic selection-record operation per adaptive question; classroom bursts of 30+ concurrent submissions without lost mastery updates.

**Constraints**: All product and committed artifacts in English; no `any`; no student data sent to the legacy classifier; service-role key server/operator only; all schema/RLS/function changes through migrations; server-side selection and mastery are authoritative; MCQ has one active KC; every SAQ part has one; no historical pre-launch attempt replay; `P(F)=0` in version 1; adaptive rollout is per standard and fails closed on coverage gaps.

**Scale/Scope**: 100+ live users; 30+ concurrent classroom users; 905 legacy unmapped MCQs across 139 sets at the 2026-07-10 inventory, 570 included in Self Practice; 24 Keystone Biology standards and the current KC CSV catalog; two or three SAQ parts; one current mastery row per student/KC plus append-only events; one admin coverage page and one adaptive next-question endpoint.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| # | Principle | Pre-Design | Post-Design | Evidence |
|---|-----------|------------|-------------|----------|
| I | English-Only Product Surface | PASS | PASS | All spec artifacts, prompts, CLI output, API errors, admin status text, and student empty states are English. |
| II | Intuitive UX | PASS | PASS | Student flow still shows one question at a time with no BKT jargon or required training. Missing coverage produces a plain-English bounded outcome. Admin coverage work uses explicit Preview, Publish, and Roll Back commands/states with confirmation. Responsive requirements remain >=360px. |
| III | Scalability & Reliability | PASS | PASS | No LLM is called in student hot paths. Indexed mapping/mastery queries prevent JSON scans and N+1 access. Attempt triggers and row locks prevent concurrent lost updates. Classifier batches are bounded, resumable, rate-limited, and outside request traffic. Capacity note: each Practice item adds one next-question request; each eligible answer adds one short transactional trigger execution. |
| IV | Curriculum Alignment | PASS | PASS | `standard_id` is validated against `STANDARD_DEFINITIONS`; KC codes must reference the authoritative catalog and share the question's standard. Classification outputs are constrained to standard-local KCs. Generator prompts and classifier prompts remain versioned in the repository. |
| V | Privacy & Role-Based Access | PASS | PASS | The classifier receives question content and standard-local KC definitions only, never student identifiers, answers, attempts, or scores. Student mastery is self-readable and teacher/admin-readable only through existing school access rules. Route handlers re-verify `getUser()` and profile role. Service-role operations remain server/operator only. Functions revoke default execution and use a fixed search path when elevated privileges are required. |

**Development workflow gates**: feature is spec-first; pure utilities and protected routes receive tests; all DB changes are migrations; implementation verification must run `npm run lint`, `npm test`, focused SQL tests, and adaptive Playwright smoke coverage.

**Gate result**: PASS. No constitution violation requires Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-bkt-adaptive-mastery/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── adaptive-next-question.md
│   ├── kc-classification-cli.md
│   ├── kc-coverage-admin.md
│   ├── mastery-observation.md
│   └── parameter-management.md
├── checklists/
│   └── requirements.md
└── tasks.md                         # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── types/
│   └── bkt.ts                       # KC, parameters, mastery/event, selection and classifier types
├── lib/
│   ├── bkt/
│   │   ├── calculation.ts           # Pure reference posterior/transition/replay functions
│   │   ├── calculation.test.ts
│   │   ├── fixtures.ts              # Golden TypeScript/SQL/pyBKT-compatible sequences
│   │   ├── kc-catalog.ts            # Authoritative catalog reads and standard validation
│   │   ├── mappings.ts              # Question/part mapping guards and content hashing
│   │   ├── parameters.ts            # Active parameter resolution and display-safe metadata
│   │   ├── selection.ts             # First pass, 2+1 rotation, MCQ/SAQ ranking and fallback
│   │   ├── selection.test.ts
│   │   └── coverage.ts              # Per-standard coverage/activation evaluation
│   ├── llm/
│   │   └── client.ts                # Extend usage detail + strict classification schema support
│   ├── question-storage.ts           # Remove static migration; surface synchronized mappings
│   └── school-generated-questions.ts # Return only adaptive-eligible content when requested
├── app/
│   ├── api/
│   │   ├── practice/next/route.ts    # Authenticated one-at-a-time adaptive selector
│   │   └── admin/kc-coverage/
│   │       ├── route.ts              # Coverage, runs, disagreements, activation status
│   │       └── publish/route.ts      # Admin-confirmed publish/rollback/activation commands
│   ├── content/kc-coverage/page.tsx  # Quiet operational coverage and classification view
│   └── content/questions/[setId]/page.tsx # Remove bundled Initial Question Bank branch
├── components/
│   └── modes/AdaptivePracticeMode.tsx # Request next item after each finalized response
├── hooks/
│   └── useQuestions.ts               # Remove bundled fallback; retain fixed-mode bank loading
└── data/
    ├── questions.json                # DELETE
    └── question-sets.json            # DELETE if no non-legacy entries remain

scripts/
└── bkt/
    ├── classify-legacy-kcs.ts        # Preview/resume classification runner
    ├── publish-kc-run.ts             # Explicit publish and rollback wrapper
    └── verify-kc-coverage.ts          # Read-only inventory and activation preflight

supabase/migrations/
├── <ts>_bkt_catalog_mappings.sql      # KC catalog, mapping versions, sync trigger, RLS
├── <ts>_bkt_parameters_mastery.sql    # Parameters, states, events, atomic observation/replay
├── <ts>_bkt_adaptive_selection.sql    # Rotation, decisions, rollout gate, indexes/RLS
└── <ts>_bkt_classification.sql        # Runs, decisions, publish/rollback functions, RLS

Integration points modified:
├── src/app/api/analytics/attempts/route.ts       # Server-recompute MCQ correctness; trigger applies mapped BKT
├── src/app/api/short-answer/grade/route.ts       # Existing part write; trigger applies mapped BKT
├── src/app/api/generate-questions/route.ts       # Continue required MCQ KC metadata
├── src/app/content/mass-production/page.tsx      # Continue required SAQ part metadata
├── src/lib/short-answer/generation/data.ts       # Read authoritative runtime KC catalog
├── src/lib/short-answer/item-schema.ts           # Same-standard part-KC validation
├── src/lib/standards.ts                          # Retain standards; remove legacy static-bank comment/map only if unused
├── scripts/migrate-glossary.js                   # DELETE obsolete static-bank migration
└── package.json                                  # Add operator scripts; no dependency changes
```

**Structure Decision**: Keep one Next.js application. Pure selection/calculation code lives under `src/lib/bkt`; transactional correctness and RLS live in migrations; protected web interfaces live under App Router; legacy bulk work lives under `scripts/bkt` and is never imported into browser bundles. Existing question generation and grading remain their owning modules and connect through mapping/attempt database boundaries.

## Design Decisions

### Mastery write path

1. Existing authenticated routes validate and persist an MCQ attempt or SAQ part attempt. MCQ correctness is recomputed server-side from the authorized question or assignment snapshot; client-supplied correctness is never authoritative for BKT.
2. A database trigger ignores unresolved mappings and SAQ summary rows, otherwise resolves the active mapping and active format parameter set.
3. `apply_bkt_observation` deduplicates the source attempt, creates/locks the student/KC state, calculates posterior and transition, appends a mastery event, and updates current state.
4. If the observation is older than the current latest event or a scored result is corrected, `rebuild_student_kc_mastery` replays non-superseded events in `(answered_at, created_at, id)` order.
5. The attempt and mastery work commit or roll back together.

### Adaptive read/selection path

1. `POST /api/practice/next` re-verifies the student and validates the ordered standard/session scope.
2. One set-based query loads active KCs, current mastery/default priors, rotation state, recent exposure, and accessible mapped candidates.
3. Across multiple selected standards, the pure selector serves unseen KCs in standard/catalog order, then interleaves eligible standards by least recent exposure. Within the chosen standard it repeats the deterministic two-priority/one-rotation KC cycle and excludes `P(L)>=0.95`.
4. Candidate items must map to the target KC. Common rank is unseen then least recent; SAQs use additional-unmastered-KC coverage only against other SAQs at the same common rank.
5. An atomic compare-and-record function persists the selection and increments rotation version. A version conflict reloads and retries twice before returning a retriable error.

### Legacy classification path

1. Read-only preflight inventories current hashes and eligible scope.
2. Preview runs two isolated classifiers in standard-grouped batches of up to 10 questions, concurrency 3, with per-item semantic validation and individual retry for failed batch members.
3. Run and decision records store models, prompt versions, content hashes, rationales, outcomes, and input/output token usage. Preview changes no active mapping.
4. Explicit publication accepts only same-KC agreements whose content hash still matches and whose KC remains active/same-standard.
5. Per-standard coverage is recomputed before activation. Rollback closes that run's mapping versions and disables affected adaptive standards.

## Implementation Phases

### Phase A - Foundations

- Seed the authoritative KC catalog and active v1 parameter sets.
- Add versioned question mappings and database synchronization/validation.
- Add pure BKT calculation fixtures and SQL conformance tests.

### Phase B - Mastery persistence

- Add current mastery and immutable events.
- Add atomic attempt triggers, row locking, deduplication, replay, and RLS.
- Verify MCQ, SAQ retries, Exam, Review, offline sync, concurrency, and correction sequences.

### Phase C - Adaptive Practice

- Add rotation/selection records and per-standard rollout gate.
- Implement server selector and convert self-practice from upfront shuffle to one-at-a-time fetch.
- Preserve fixed Exam, Review, and assignment snapshot behavior.

### Phase D - Legacy mapping

- Add classification run/decision persistence and operator CLI.
- Execute a 20+ item preview only after unit/contract verification; review agreement and usage.
- Publish Self Practice mappings in staged standards only after explicit approval and coverage preflight.
- Do not classify or write production data as part of planning or ordinary test runs.

### Phase E - Cleanup and rollout

- Remove the bundled initial bank and obsolete migration script.
- Validate English empty/configuration states.
- Activate qualifying standards, monitor selection/coverage events, then expand to remaining legacy questions.

## Complexity Tracking

No constitution violations. New tables/functions are required for transactional correctness, versioning, auditability, and indexed KC selection; they stay within the existing Next.js/Supabase architecture and add no runtime or dependency family.
