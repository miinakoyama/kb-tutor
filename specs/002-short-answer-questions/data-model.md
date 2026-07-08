# Data Model: Short-Answer (Constructed-Response) Questions

**Feature**: `002-short-answer-questions` | **Date**: 2026-07-08

Conventions: all tables in `public`, RLS enabled, `id uuid PK default gen_random_uuid()`, `created_at/updated_at timestamptz not null default now()` unless noted. All schema changes land as files in `supabase/migrations/`.

---

## 1. Content types (TypeScript, stored as JSONB — no new table)

Short-answer items live in the existing `generated_questions.payload` (and `assignment_question_snapshots.payload`) with `questionType: "open-ended"` and a new `shortAnswer` field. Defined in `src/types/short-answer.ts`.

### ShortAnswerItem (payload.shortAnswer)

| Field | Type | Notes |
|---|---|---|
| `stem` | `string` | Context passage. Required, non-empty. |
| `stimulus` | `StimulusAsset` | Exactly one typed stimulus. |
| `parts` | `ShortAnswerPart[]` | 2–3 entries, labels `"A"`,`"B"`,`"C"` in order. |
| `scoringRubric` | `HolisticRubric` | Legacy-only holistic rubric. New generated items omit it. |
| `keyTerms` | `{ term: string; definition: string }[]` | Completion section + glossary chips. |
| `annotatedResponses` | `AnnotatedResponse[]` | One per score level 0..pointsPossible; score-max entry is the model-answer source. |
| `blueprint` | `ItemBlueprint` | Retained per FR-036. |
| `generation` | `GenerationMetadata` | `method: "method2_blueprint_no_rag_l3"`, `modelId`, `temperature`, `grounding`, `generatedAt`. |

### ShortAnswerPart

| Field | Type | Notes |
|---|---|---|
| `label` | `"A" \| "B" \| "C"` | |
| `prompt` | `string` | Student-facing question; asks exactly one thing. |
| `taskType` | `TaskType` | `recall_identify \| explain_mechanism \| evaluation_justification \| experimental_design \| apply_concept \| synthesis_design` |
| `maxScore` | `number` | Integer ≥1; item total is the sum of all part `maxScore` values. |
| `rubric` | `PartRubric` | Required part-level criteria used for grading and feedback. |
| `scoringGuidance` | `string` | Legacy part rubric text fallback. |
| `maxLength` | `number` | Character limit for the textarea (default 500). |

### StimulusAsset (discriminated union on `type`)

| `type` | Payload field | Validation |
|---|---|---|
| `table` | `tableMarkdown: string` | Non-empty markdown table. |
| `line_graph` / `bar_chart` | `chartData: { xLabel, yLabel, series: { name, points: [x, y][] }[] }` | ≥1 series, numeric y. |
| `diagram` | `diagramSvg: string` | Validated: no `<script`, `on*=` handlers, external refs; size-capped. |
| `scenario` | `scenarioText: string` | Non-empty. |
| `illustration` | `illustrationPrompt: string` | Non-empty. |
| (all) | `title: string` | Rendered separately by the app. |

### ItemBlueprint

Mirrors `reference-pipeline.md` blueprint schema (camelCased): `targetStandard`, `anchorKc`, `coreKc`, `selectedKcs[]`, `supportingKcs[]`, `stemAffordance`, `compatibilityRationale`, `cognitiveDemand`, `keyConcepts[]`, `taskSequence{PartA..C: {kcCode, taskType, function}}`, `stimulusType`, `evidencePattern`, `expectedResponseElements[]`, `commonIncompleteResponses[]`.

**Invariants (enforced by `item-schema.ts` validators, FR-034)**: `anchorKc === coreKc`; every taskSequence KC ∈ `selectedKcs`; KCs valid for the standard; task types ∈ taxonomy; `stimulus.type === blueprint.stimulusType`; part rubric points sum to `pointsPossible`; annotated responses cover every score 0..pointsPossible; no placeholder text (`[...]` / angle-bracket templates); `standardId` ∈ `STANDARD_DEFINITIONS`.

---

## 2. `short_answer_attempts` (new table)

One row per graded submission of one part (practice/review/assignment immediately; exam at exam submission).

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | NOT NULL, default `auth.uid()`, FK → `auth.users` |
| `question_id` | text | NOT NULL |
| `question_set_id` | uuid | NULL (FK → `generated_question_sets`) |
| `assignment_id` | text | NULL |
| `part_label` | text | NOT NULL, CHECK in (`'A'`,`'B'`,`'C'`) |
| `attempt_number` | smallint | NOT NULL, CHECK in (1,2) |
| `client_attempt_id` | uuid | NOT NULL, UNIQUE (idempotent retries) |
| `mode` | text | NOT NULL (`practice`/`exam`/`review`) |
| `response_text` | text | NOT NULL (may be empty string for counted empty submissions) |
| `score` | smallint | NOT NULL |
| `max_score` | smallint | NOT NULL |
| `is_correct` | boolean | NOT NULL (score = max_score) |
| `feedback` | jsonb | NOT NULL — `{ verdict, segments: [{label, text}], modelAnswer?, glossaryTerms?: string[] }` |
| `diagnosed_gap` | text | NULL |
| `confidence` | text | NULL, CHECK in (`'high'`,`'medium'`,`'low'`) |
| `method` | text | NOT NULL (`'1'`/`'2'`/`'3'`; `'none'` for empty submissions) |
| `model_id` | text | NULL |
| `temperature` | numeric(3,2) | NULL |
| `token_count` | integer | NULL |
| `latency_ms` | integer | NULL |
| `answered_at` | timestamptz | NOT NULL |
| `created_at` | timestamptz | NOT NULL |

Uniqueness: `UNIQUE (user_id, question_id, part_label, attempt_number, assignment_id)` — one row per attempt slot per context (NULLs distinct is acceptable: self-practice re-runs create a new `client_attempt_id`; enforcement of the 2-attempt cap is server-side in the grade handler).

Indexes: `(user_id, question_id)`, `(assignment_id)`, `(answered_at)`, `(method, model_id)` (method-comparison queries, SC-005).

RLS: insert/select own rows (`user_id = auth.uid()`); teachers select rows of students in their schools (join via `school_members` × `school_teachers`); admin all. Writes happen server-side in the grade route with the user's session client.

**Relationship to existing `attempts`**: on part resolution, one summary row is also upserted into `attempts` (`selected_option_id = 'short-answer'`, `is_correct` = full credit, same `client_attempt_id` namespace) so existing analytics and assignment completion keep working (research R5).

## 3. `feedback_settings` (new table)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `scope` | text | NOT NULL, CHECK in (`'school'`,`'default'`) |
| `school_id` | uuid | NULL, FK → `schools`; NOT NULL iff scope=`school`; UNIQUE |
| `method` | text | NOT NULL, CHECK in (`'1'`,`'2'`,`'3'`) |
| `model_id` | text | NOT NULL (validated against catalog in handler) |
| `temperature` | numeric(3,2) | NOT NULL |
| `updated_by` | uuid | NOT NULL (profile id) |
| `created_at` / `updated_at` | timestamptz | NOT NULL |

Partial unique index: at most one row where `scope='default'`.

Resolution order (in `src/lib/short-answer/settings.ts`): student's school row → default row → hardcoded (method 2, `gpt-5.4`, temp 1). Multi-school students: most recent `school_members.created_at`.

RLS: no student access (not even select). Teachers select/update rows for their schools; admin all + default row. Reads for grading happen server-side.

## 4. `feedback_reports` (new table)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `student_user_id` | uuid | NOT NULL, default `auth.uid()` |
| `attempt_id` | uuid | NOT NULL, FK → `short_answer_attempts` |
| `question_id` | text | NOT NULL (denormalized for listing) |
| `part_label` | text | NOT NULL |
| `note` | text | NULL (student's optional "what seems wrong") |
| `reviewed_at` | timestamptz | NULL |
| `reviewed_by` | uuid | NULL |
| `created_at` | timestamptz | NOT NULL |

`UNIQUE (student_user_id, attempt_id)` — one report per attempt. The attempt row supplies the submitted answer + feedback shown (US4 context).

Indexes: `(reviewed_at)`, `(created_at)`.

RLS: students insert/select own; teachers select/update (`reviewed_at`, `reviewed_by`) for reports whose student is in their schools; admin all.

## 5. `student_question_notes` (new table)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | NOT NULL, default `auth.uid()` |
| `question_id` | text | NOT NULL |
| `note_text` | text | NOT NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL |

`UNIQUE (user_id, question_id)`. Index `(user_id, updated_at desc)` for the newest-first `/my-notes` list.

RLS: self insert/update/select/delete (`user_id = auth.uid()`); teachers/admin no access needed in this feature.

## 6. `user_settings` (existing table — new column)

| Column | Type | Notes |
|---|---|---|
| `short_answer_tour_seen_at` | timestamptz NULL | Set when the spotlight tour is completed/skipped (FR-018). Same pattern as `onboarding_completed_at`. |

## 7. Client-side / ephemeral state (no persistence)

- **Highlights**: in-memory per question view (session-scoped per spec assumption).
- **Unsubmitted drafts**: component state only.
- **Exam-mode responses before submission**: existing exam-session local state, graded at submit.

## State transitions (part lifecycle, practice modes)

```
locked → active → submitting(1) → resolved(correct)                     [attempt 1 correct]
                               └→ retry-available → submitting(2) → resolved(correct | exhausted)
resolved → countdown(3s) → next part unlocked (or completion section)
```

Empty submission counts as an attempt but records `method='none'`, no LLM call. A failed LLM call (after retry) returns the part to its pre-submit state (attempt not consumed, no row written).

Exam mode: `active → answered(local)` per part; at exam submission all parts grade sequentially (`attempt_number = 1`, `mode='exam'`) and results appear in exam review.
