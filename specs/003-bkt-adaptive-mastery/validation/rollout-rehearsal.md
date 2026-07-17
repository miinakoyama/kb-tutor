# BKT Rollout Rehearsal

**Date:** 2026-07-12

**Environment:** Local Supabase project (`127.0.0.1`), non-production

**Operator approval:** Explicitly provided in the implementation request

**Classification run:** `34621e5e-d565-4254-9d29-255a1a025461`

**Scope:** 24 legacy MCQs from the approved T028 preview sample

## Outcome

The rehearsal passed. Publication, idempotent re-publication, coverage preflight,
one-standard activation, content-drift protection, rollback, and idempotent
re-rollback all behaved as required. No hosted or production data was read or
modified.

## Publication

- The preview contained 24 completed questions, 22 two-model agreements, two
  unresolved questions, and no classifier errors.
- Publication created 22 mappings: A=2, B=3, C=3, D=2, E=3, F=3, G=3, P=3.
- Re-publishing the unchanged run created zero additional mappings.
- `legacy-preview-002` (ambiguous second pass) and `legacy-preview-010`
  (invalid second pass) retained zero active mappings.
- Classification decisions remained immutable and available for audit.

## Coverage And Activation

- Before coverage preparation, standard `3.1.9-12.A` had 0 covered of 7 active
  KCs. Preflight returned `disabled`, and an activation attempt failed with
  `Standard coverage is not ready`.
- Seven local-only Self Practice fixtures were added, one for each active A1-A7
  KC. Preflight then reported 7 eligible questions, 7 covered KCs, 7 active KCs,
  and zero unresolved Self Practice questions.
- Standard A transitioned from `ready` to `enabled` through
  `set_bkt_standard_rollout`.

## Content Drift

- The text of one agreed legacy question was revised after publication.
- Its confirmed mapping was closed and retained with `stale` status. Its source
  hash remained the original hash while the question acquired a new content
  hash.
- Re-publishing the run created zero mappings for the revised question because
  its current content no longer matched the stored classification decision.
- The rollout coverage hash now includes eligible question content and mapping
  state. Activation recomputes preflight at the enable boundary so a stale
  `ready` result cannot be reused after content changes.

## Rollback

- The CLI rollback closed the remaining 21 active run mappings. Together with
  the drifted mapping, all 22 published mappings remain as inactive history.
- Standard A changed from `enabled` to `disabled` with reason
  `Classification run rolled back`.
- All 48 pass-level classification decisions remained present.
- The revised question payload hash was identical before and after rollback,
  confirming that rollback changes mappings and rollout state, not question
  content.
- A repeated rollback returned zero and left zero active run mappings.

## Defects Found And Corrected

1. `publish_kc_classification_run` originally used an ambiguous
   `standard_id` reference in its `RETURNING`/grouping path. The returned column
   is now explicitly aliased as `inserted_standard_id`.
2. Rollout activation relied on a previously stored readiness row. It now runs
   coverage validation immediately before activation and reads scalar readiness
   fields, avoiding stale coverage and composite-expansion surprises.
3. The coverage hash previously represented only aggregate counts. It now also
   represents the ordered KC catalog plus every eligible question's content
   hash, coverage state, and confirmed KC codes.

These paths are covered by 17 assertions in
`supabase/tests/bkt_classification.sql`, including real publish, repeat publish,
activation, content-hash refresh, rollback, and repeat rollback execution.

## Production Decision

The mechanism is suitable for a disabled-by-default production deployment under
the production runbook. This rehearsal does not authorize a production publish;
production still requires a fresh preview, explicit operator approval, coverage
preflight, and per-standard activation.
