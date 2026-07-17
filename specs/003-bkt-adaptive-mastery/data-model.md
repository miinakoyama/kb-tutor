# Data Model: BKT Adaptive Mastery

**Feature**: `003-bkt-adaptive-mastery` | **Date**: 2026-07-11

Conventions: tables are in `public`; UUID primary keys default to `gen_random_uuid()`; timestamps are `timestamptz NOT NULL DEFAULT now()` unless stated; probability columns are `double precision` with `CHECK (value BETWEEN 0 AND 1)`; all schema, functions, triggers, indexes, grants, and RLS policies ship through `supabase/migrations/`.

## 1. `knowledge_components`

Authoritative runtime KC catalog, initially seeded from `src/data/short-answer/kc_table.csv`. Generation, mapping validation, selection, and BKT all resolve the same rows.

| Column | Type | Constraints / meaning |
|---|---|---|
| `code` | text | PK; full code such as `3.1.9-12.A2` |
| `short_code` | text | NOT NULL; such as `A2` |
| `standard_id` | text | NOT NULL; must exist in application `STANDARD_DEFINITIONS` before migration ships |
| `statement` | text | NOT NULL, non-empty |
| `keywords` | text[] | NOT NULL default `{}` |
| `sort_order` | smallint | NOT NULL, >=1; fixed first-pass order within a standard |
| `active` | boolean | NOT NULL default true |
| `catalog_version` | text | NOT NULL; repository catalog version/seed migration |
| `created_at`, `updated_at` | timestamptz | audit timestamps |

Constraints/indexes:

- `UNIQUE (standard_id, short_code)`
- `UNIQUE (standard_id, sort_order)` for active catalog rows
- index `(standard_id, active, sort_order)`
- code/standard consistency validated by seed tests and write functions

RLS: authenticated users may read active rows; admin may read all. Runtime writes are migration/service-only in version 1.

## 2. `bkt_parameter_sets`

Immutable, versioned model parameters. Version 1 seeds one active row per question format.

| Column | Type | Constraints / meaning |
|---|---|---|
| `id` | uuid | PK |
| `version` | text | NOT NULL, unique human-readable version |
| `question_format` | text | `mcq` or `saq` |
| `p_l0` | double precision | initial mastery; v1 `0.30` |
| `p_t` | double precision | learn transition; v1 `0.10` |
| `p_s` | double precision | slip; v1 `0.10` |
| `p_g` | double precision | guess; MCQ `0.25`, SAQ `0.10` |
| `p_f` | double precision | forgetting; v1 `0` |
| `mastery_threshold` | double precision | v1 `0.95` |
| `status` | text | `draft`, `active`, or `retired` |
| `notes` | text | nullable fit/source notes |
| `activated_at` | timestamptz | nullable |
| `activated_by` | uuid | nullable FK to profiles |
| `created_at` | timestamptz | audit timestamp |

Constraints/indexes:

- all probabilities in `[0,1]`
- `p_g + p_s < 1`
- partial unique index: one `status='active'` row per `question_format`
- active version-1 rows require `p_f=0`; future migrations may introduce a separately validated model family

RLS: authenticated users do not need direct parameter reads. Admin may read; writes/activation use a restricted function or migration.

Activation semantics:

- existing `student_kc_mastery` probabilities are not silently recomputed
- the next new observation uses the newly active format parameter set and records its ID
- a previously unseen student/KC initializes from the active set's `p_l0`
- historical events remain reproducible from their recorded parameter set

## 3. `question_kc_assignments`

Versioned operational mapping used for candidate queries and evidence attribution. Payload KC fields remain portable content metadata; this table is authoritative for adaptive runtime behavior.

| Column | Type | Constraints / meaning |
|---|---|---|
| `id` | uuid | PK; referenced by mastery events |
| `question_id` | text | NOT NULL FK to `generated_questions(id)` ON DELETE CASCADE |
| `part_label` | text | NULL for MCQ; `A`, `B`, or `C` for SAQ |
| `kc_code` | text | NOT NULL FK to `knowledge_components(code)` |
| `source` | text | `content`, `model`, or `human` |
| `source_run_id` | uuid | nullable FK to `kc_classification_runs` |
| `source_content_hash` | text | NOT NULL SHA-256 of mapping-relevant question content |
| `active` | boolean | NOT NULL default true |
| `valid_from` | timestamptz | NOT NULL |
| `valid_to` | timestamptz | nullable; set when superseded/rolled back |
| `created_by` | uuid | nullable profile; null for content trigger |
| `created_at` | timestamptz | audit timestamp |

Constraints/indexes:

- active unique expression index on `(question_id, COALESCE(part_label, '')) WHERE active`
- index `(kc_code, active, question_id)` for selection
- index `(question_id, active)` for scoring
- MCQ requires exactly one active row with `part_label IS NULL`
- SAQ requires exactly one active row for every stored part and no null-part row
- assignment KC standard must equal payload `standardId`
- content edits close model assignments when `source_content_hash` changes

RLS: active mappings are readable only through authorized question access or server routes; admins can inspect all versions. Direct authenticated writes are denied. Sync/publish functions own writes.

### Mapping synchronization trigger

On `generated_questions` insert/update:

1. Compute a stable hash from `standardId`, question text/stem, options, correct answer, explanation/rubric, and SAQ part prompts/KC task sequence.
2. Validate `standardId` against the application-owned standard list enforced by the request path and validate every KC against `knowledge_components` in the same standard.
3. For valid embedded mappings, close changed `source='content'` rows and create current versions.
4. If content changed but has no embedded MCQ KC, close any `source='model'` mapping whose hash no longer matches.
5. Reject `include_in_self_practice=true` when required mappings are absent/invalid. Non-Self-Practice legacy content may remain stored but unresolved.

## 4. `kc_classification_runs`

One auditable operator run over a stable set of legacy MCQs.

| Column | Type | Constraints / meaning |
|---|---|---|
| `id` | uuid | PK |
| `status` | text | `created`, `running`, `preview_complete`, `approved`, `published`, `failed`, `rolled_back` |
| `scope` | jsonb | selected standards/set IDs, Self Practice filter, question IDs, inventory timestamp |
| `classifier_a_model`, `classifier_b_model` | text | NOT NULL |
| `classifier_a_prompt_version`, `classifier_b_prompt_version` | text | NOT NULL |
| `target_count` | integer | NOT NULL >=0 |
| `completed_count`, `agreement_count`, `unresolved_count`, `error_count` | integer | NOT NULL default 0 |
| `input_tokens`, `output_tokens` | bigint | NOT NULL default 0 |
| `started_at`, `completed_at`, `approved_at`, `published_at`, `rolled_back_at` | timestamptz | nullable state timestamps |
| `created_by`, `approved_by` | uuid | admin profile IDs |
| `failure_message` | text | nullable, operator-safe |
| `created_at` | timestamptz | audit timestamp |

Indexes: `(status, created_at DESC)`, GIN on `scope` only if admin filtering needs it after initial implementation measurement.

RLS: admin select only. Writes through service-role classifier and restricted admin publish/rollback functions.

State transitions:

```text
created -> running -> preview_complete -> approved -> published
                   \-> failed             \-> failed
published -> rolled_back
```

No transition before `published` changes active mappings.

## 5. `kc_classification_decisions`

One isolated classifier decision per pass and question.

| Column | Type | Constraints / meaning |
|---|---|---|
| `id` | uuid | PK |
| `run_id` | uuid | NOT NULL FK to classification run ON DELETE CASCADE |
| `question_id` | text | NOT NULL FK to generated question |
| `pass` | smallint | 1 or 2 |
| `model_id`, `prompt_version` | text | NOT NULL |
| `source_content_hash` | text | NOT NULL |
| `outcome` | text | `assigned`, `ambiguous`, `invalid`, or `error` |
| `kc_code` | text | nullable FK to KC catalog; required only for `assigned` |
| `rationale` | text | nullable; concise operator-facing explanation |
| `input_tokens`, `output_tokens` | integer | NOT NULL default 0 |
| `latency_ms` | integer | nullable |
| `error_code` | text | nullable normalized code, no secrets |
| `created_at` | timestamptz | audit timestamp |

Constraints/indexes:

- `UNIQUE (run_id, question_id, pass)` enables resume/idempotency
- index `(run_id, outcome)` and `(question_id, created_at DESC)`
- `kc_code` must belong to the question's standard at decision validation time
- agreement is derived only when both passes are `assigned`, hashes match, and `kc_code` is identical

## 6. `student_kc_mastery`

Current materialized state for fast selection. Absence means use active format `P(L0)`; no eager student x KC fan-out is required.

| Column | Type | Constraints / meaning |
|---|---|---|
| `user_id` | uuid | PK part, FK to auth users ON DELETE CASCADE |
| `kc_code` | text | PK part, FK to KC catalog |
| `probability` | double precision | current `P(L)` |
| `mastered` | boolean | current threshold comparison |
| `last_parameter_set_id` | uuid | FK to parameter set |
| `observation_count` | integer | NOT NULL >=0 |
| `latest_event_id` | uuid | nullable FK to mastery event, added after both tables exist |
| `latest_answered_at` | timestamptz | nullable |
| `lock_version` | bigint | NOT NULL default 0; selection/read diagnostics |
| `created_at`, `updated_at` | timestamptz | audit timestamps |

Indexes: `(user_id, mastered, probability DESC)`, `(user_id, kc_code)` is the PK.

RLS:

- students select own rows
- teachers select students allowed by `teacher_can_read_student_profile`
- admins select all
- no direct client insert/update/delete; observation function owns writes

## 7. `bkt_mastery_events`

Append-only evidence and transition audit. Corrections append a newer source revision and mark the older source event logically superseded; rows are never deleted or overwritten.

| Column | Type | Constraints / meaning |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | NOT NULL FK to auth users |
| `kc_code` | text | NOT NULL FK to KC catalog |
| `event_type` | text | `observation`, `correction`, or `replay` |
| `source_kind` | text | `mcq_attempt` or `saq_part_attempt`; nullable only for replay |
| `source_attempt_id` | uuid | nullable source row ID |
| `source_revision` | smallint | NOT NULL default 1 |
| `supersedes_event_id` | uuid | nullable self-FK |
| `mapping_id` | uuid | nullable only for replay; FK to assignment version |
| `parameter_set_id` | uuid | NOT NULL FK to parameter set |
| `question_id` | text | nullable only for replay |
| `part_label` | text | nullable for MCQ/replay |
| `question_format` | text | `mcq` or `saq` |
| `mode` | text | `practice`, `exam`, or `review`; nullable for replay |
| `is_correct` | boolean | nullable only for replay |
| `prior_probability` | double precision | state used for this recorded transition |
| `posterior_probability` | double precision | after response evidence, before transition |
| `resulting_probability` | double precision | after learn/forget transition or replay final |
| `answered_at` | timestamptz | source chronology |
| `created_at` | timestamptz | receipt/audit chronology |

Constraints/indexes:

- unique `(source_kind, source_attempt_id, source_revision)` where source ID is not null
- index `(user_id, kc_code, answered_at, created_at, id)` for replay
- index `(question_id, part_label)` for audits
- all probability snapshots in `[0,1]`
- a source's latest non-superseded revision is the active evidence used in replay

RLS mirrors current mastery select access; writes only from protected functions/triggers.

### Observation/replay algorithm

1. Resolve the source attempt's active mapping and active format parameter set.
2. If the exact source revision exists, return it without state change.
3. Insert the missing mastery row if necessary, then `SELECT ... FOR UPDATE` it.
4. For an in-order new source, calculate and append one transition, then update current state.
5. For an older `answered_at` or correction, append correction evidence, mark the previous source event superseded, replay active evidence ordered by `(answered_at, created_at, id)`, append a replay summary, and replace current state.
6. MCQ summary rows with `selected_option_id='short-answer'` never create events; SAQ evidence comes only from `short_answer_attempts`.

## 8. `adaptive_rotation_states`

Persistent per-student/per-standard selector state.

| Column | Type | Constraints / meaning |
|---|---|---|
| `user_id` | uuid | PK part |
| `standard_id` | text | PK part |
| `cycle_position` | smallint | 0, 1, or 2; positions 0/1 priority, 2 rotation |
| `last_target_kc` | text | nullable FK to KC catalog |
| `consecutive_target_count` | smallint | NOT NULL default 0, 0..2 |
| `version` | bigint | NOT NULL default 0; compare-and-record token |
| `updated_at` | timestamptz | audit timestamp |

First-pass completion is derived from mastery events: an active KC with no observation remains unseen, regardless of session. The stored cycle applies only after no unseen eligible KC remains.

RLS: students may read own state only if needed; server function owns writes. Teachers/admins have no version-1 UI need.

## 9. `adaptive_selection_events`

Append-only explanation of each selection attempt, including coverage gaps.

| Column | Type | Constraints / meaning |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | NOT NULL |
| `session_id` | uuid | nullable FK to analytics session |
| `standard_id` | text | NOT NULL |
| `lane` | text | `first_pass`, `priority`, `rotation`, or `fallback` |
| `cycle_position_before` | smallint | nullable during first pass |
| `target_kc` | text | NOT NULL FK to KC catalog |
| `question_id` | text | nullable for gap-only event |
| `question_format` | text | nullable or `mcq`/`saq` |
| `candidate_kcs` | text[] | ordered KC candidates considered |
| `candidate_question_ids` | text[] | ordered eligible question candidates for target |
| `mastery_snapshot` | jsonb | candidate KC probabilities/mastered/unseen state only |
| `fallback_reason` | text | nullable normalized code |
| `rotation_version_before`, `rotation_version_after` | bigint | concurrency audit |
| `created_at` | timestamptz | selection time |

Indexes: `(user_id, standard_id, created_at DESC)`, `(session_id, created_at)`, `(target_kc, created_at)`.

RLS: server-only writes; students do not need direct reads. Admin diagnostic reads; future teacher analytics is out of scope.

## 10. `bkt_standard_rollouts`

Fail-closed activation gate per Keystone standard.

| Column | Type | Constraints / meaning |
|---|---|---|
| `standard_id` | text | PK |
| `status` | text | `disabled`, `validating`, `ready`, or `enabled` |
| `coverage_hash` | text | nullable snapshot of active KCs/questions/mappings |
| `eligible_question_count` | integer | NOT NULL default 0 |
| `covered_kc_count`, `active_kc_count`, `unresolved_self_practice_count` | integer | NOT NULL default 0 |
| `validated_at`, `enabled_at`, `disabled_at` | timestamptz | nullable |
| `enabled_by` | uuid | nullable admin profile |
| `disable_reason` | text | nullable normalized/operator-safe |
| `updated_at` | timestamptz | audit timestamp |

Activation validation requires:

- no unresolved Self Practice question is treated as eligible
- every eligible MCQ has one active mapping
- every eligible SAQ part has one active mapping
- each active KC intended for the standard has at least one accessible eligible question
- stored `coverage_hash` still matches at enable time

Any rollback or content edit that invalidates the hash changes status to `disabled` or `validating` before more adaptive selections are issued.

RLS: authenticated users may read only whether a standard is enabled through server responses; admin can inspect all. Writes use restricted admin functions.

## 11. Derived coverage view

`bkt_question_coverage` (security-barrier view or admin RPC result) reports per question:

- question/set/standard/format and Self Practice flags
- expected mapping slots (1 for MCQ, part count for SAQ)
- active valid mapping count
- state: `valid`, `unresolved`, `invalid`, or `excluded`
- latest classification run/agreement outcome
- content hash drift

The admin coverage endpoint aggregates this view by standard, set, format, and rollout state without exposing student data.

## 12. Content and client-state changes

- Delete the bundled `questions.json` and its only initial `question-sets.json` entry after imports are removed.
- Self Practice no longer pre-shuffles/caps the whole bank. It holds the current returned question and requests the next after finalization.
- Exam, Review, and assignment snapshot question arrays remain unchanged.
- No localStorage stores authoritative mastery or rotation state.
- The KC shown in question content remains embedded for export/preview; runtime selection uses active assignment rows.
