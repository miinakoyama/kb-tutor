# BKT Production Runbook

## Preconditions

- All CI checks and local migration/pgTAP verification pass.
- A current database backup and rollback owner are confirmed.
- OpenAI and Gemini credentials are available only in the trusted operator environment.
- An administrator profile UUID is available for explicit publication actions.
- No standard is enabled during schema deployment.

## Deployment

1. Deploy the application and migrations with every `bkt_standard_rollouts` row absent or `disabled`.
2. Confirm the two active `bkt-v1-no-forgetting` parameter sets and 106 active KCs.
3. Run `npm run bkt:coverage` and retain the output with the release record.
4. Confirm Practice returns `scope_unavailable` for standards that are not enabled.

## Classification Preview

1. Estimate the two-provider cost from current question counts and model prices.
2. Obtain explicit operator approval before the first paid call.
3. Run a deterministic Self Practice sample of at least 20 MCQs.
4. Confirm `Active mappings changed: 0`.
5. Review agreement, ambiguous/invalid decisions, schema errors, rationales, model/prompt versions, and measured input/output tokens.
6. Stop if semantic errors, usage, or transport failures are unacceptable. Version the prompt and create a new run instead of rewriting prior decisions.

## Staged Publication

1. Classify current Self Practice questions by a small group of standards.
2. Publish one approved run with `npm run bkt:publish -- --run <run-id> --actor <admin-id>`.
3. Run coverage validation for one standard.
4. Enable only when every active KC has usable mapped coverage and unresolved Self Practice count is zero.
5. Run a classroom-sized Practice check and monitor selection errors, coverage gaps, observation failures, and p95 latency.
6. Expand one standard group at a time. Classify non-adaptive legacy questions only after Self Practice is stable.

## Post-Launch Validation

After the staged rollout has accumulated at least 200 mastery events and 200
adaptive selection events:

1. Sample 200 stored mastery events and recompute each transition from its
   recorded parameter and mapping versions.
2. Sample 200 stored adaptive selection events and reproduce or explain each
   decision from its recorded decision context and rotation state.
3. Require 200 of 200 mastery transitions and 200 of 200 selection decisions to
   match. Investigate and record every discrepancy before expanding rollout.
4. Conduct representative student acceptance sessions and measure completion
   and confusing repetition against the product acceptance criterion.

These are post-launch operational validation activities, not prerequisites for
finishing the feature implementation before representative events exist.

## Stop Conditions

- Any invalid or cross-standard published mapping
- Duplicate or missing mastery evidence
- Selection labels an unrelated SAQ as target-KC practice
- Exam or Review selection regression
- p95 next-question or observation latency exceeds 500ms under the agreed classroom load
- Coverage hash changes after validation
- Unexpected LLM usage or student data appears in classifier inputs

## Rollback

1. Disable affected standards immediately.
2. Run `npm run bkt:rollback -- --run <run-id> --actor <admin-id>` for the relevant classification run.
3. Confirm mapping versions are closed rather than deleted and question payloads are unchanged.
4. Confirm affected rollouts remain disabled and Practice fails closed.
5. Preserve classification decisions, mastery events, and selection events for audit.
6. Correct content/mappings, create a new preview run, revalidate coverage, and require fresh enable approval.
