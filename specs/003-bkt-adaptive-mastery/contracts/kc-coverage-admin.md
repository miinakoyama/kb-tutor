# Contract: KC Coverage Administration

## UI

Route: `/content/kc-coverage` (admin only).

Primary views:

- **Coverage**: standard rows with total, valid, unresolved, invalid/excluded, KC coverage, Self Practice impact, rollout status.
- **Runs**: classification run status, models/prompts, agreement/error counts, usage, timestamps, publish/rollback status.
- **Exceptions**: disagreements, ambiguous/invalid outputs, stale content, and KCs with no eligible question.

Primary commands use explicit text and confirmation: `Preview classification`, `Publish agreed mappings`, `Roll back run`, `Enable standard`, `Disable standard`.

No student response or mastery data appears on this page.

## GET `/api/admin/kc-coverage`

Authorization: `getUser()` plus `profiles.role='admin'` in-handler.

Query parameters:

- `view=coverage|runs|exceptions` (default `coverage`)
- `standardId`
- `setId`
- `selfPractice=true|false`
- `status`
- `cursor`, `limit` (limit 1..100, default 50)

Coverage response example:

```json
{
  "rows": [
    {
      "standardId": "3.1.9-12.A",
      "questionCount": 162,
      "selfPracticeCount": 153,
      "validCount": 0,
      "unresolvedCount": 162,
      "coveredKcCount": 0,
      "activeKcCount": 7,
      "rolloutStatus": "disabled"
    }
  ],
  "nextCursor": null
}
```

Errors: `401`, `403`, `400`, generic `500`. Indexed/aggregated query only; no N+1 per standard.

## POST `/api/admin/kc-coverage/publish`

```json
{
  "action": "publish_run",
  "runId": "uuid"
}
```

Actions:

- `publish_run`: publish agreeing valid decisions
- `rollback_run`: close the run's mappings and disable affected rollouts
- `validate_standard`: recompute counts/hash and move `disabled|validating -> ready` only when valid
- `enable_standard`: compare current hash and move `ready -> enabled`
- `disable_standard`: move to disabled with an English reason
- `replace_mapping`: admin correction with question, part (nullable), and KC
- `withdraw_mapping`: remove the embedded MCQ mapping, exclude the question from Self Practice, and disable/revalidate the standard

Every destructive or activation action requires UI confirmation and is reversible where defined. Server calls restricted database functions and returns updated counts/status.

## Standard activation response

```json
{
  "standardId": "3.1.9-12.A",
  "status": "enabled",
  "coverageHash": "sha256",
  "eligibleQuestionCount": 153,
  "coveredKcCount": 7,
  "activeKcCount": 7,
  "unresolvedSelfPracticeCount": 0
}
```

Activation fails `409` when the coverage hash changed or any blocking count is non-zero.
