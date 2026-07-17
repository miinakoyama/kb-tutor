# Contract: Legacy KC Classification CLI

Operator-only, resumable classification of legacy MCQs. Preview is the default and never changes active mappings.

## Commands

```bash
npm run bkt:classify -- --sample 24 --self-practice --standards 3.1.9-12.A,3.1.9-12.B
npm run bkt:classify -- --resume <run-id>
npm run bkt:classify -- --self-practice
npm run bkt:publish -- --run <run-id> --actor <admin-profile-uuid>
npm run bkt:rollback -- --run <run-id> --actor <admin-profile-uuid>
npm run bkt:coverage -- --standards 3.1.9-12.A
```

No command publishes unless `bkt:publish` is called explicitly. Commands require server/operator environment getters and never print secret values.

## Classification scope

Supported filters:

- `--sample N`: deterministic representative sample, minimum 20 before first bulk publish
- `--self-practice`: only currently included Self Practice MCQs
- `--standards csv`
- `--sets csv`
- `--questions csv`
- `--resume run-id`: process only missing/error decisions for the existing frozen scope

The run freezes question IDs and source-content hashes. Questions changed after the run become `stale` at publication.

## Classifier inputs

Per question, and no student data:

- question ID for response correlation
- standard ID
- stem/question text
- four options and correct option
- explanation/key knowledge when present
- active KC codes and statements from that standard only

Pass A and B receive no prior decision or each other's output.

Defaults:

- A: `gpt-5.4-mini`, temperature 0
- B: `gemini-3.1-flash-lite-preview`, temperature 0
- standard-grouped batches <=10 questions
- concurrency <=3 batches per provider
- one individual retry for a missing/invalid batch item

## Structured decision

```json
{
  "questionId": "generated-question-id",
  "outcome": "assigned",
  "kcCode": "3.1.9-12.A2",
  "rationale": "The item directly asks about transcription from DNA to mRNA."
}
```

`outcome`: `assigned`, `ambiguous`, or `invalid`. Transport/schema failures are stored as `error` by the runner.

Semantic validation:

- response question ID matches one input
- assigned KC is in the supplied standard-local catalog
- rationale is concise and non-empty for assigned/ambiguous
- one decision per question per pass
- content hash still equals frozen run hash

## Preview output

English summary only; no question/student content unless `--verbose` is explicitly used in a trusted terminal.

```text
Run: <uuid>
Targeted: 24
Completed: 24
Agreed: 21
Ambiguous/disagreed: 2
Errors: 1
Input tokens: ...
Output tokens: ...
Active mappings changed: 0
```

Exit non-zero when the run cannot complete, credentials are missing, schema validation fails globally, or persistence fails. Individual item failures remain resumable and are reflected in counts.

## Publication

Publication function requirements:

- actor exists and has `profiles.role='admin'`
- run status is `preview_complete` or `approved`
- both decisions are assigned, same KC, same source hash
- current content hash still matches
- KC is active and belongs to question standard
- current mapping is absent or belongs to the same run/KC
- mapping insert and run count/state change occur transactionally

Publication prints affected standards and leaves rollout disabled until coverage preflight and explicit activation.

## Rollback

- actor must be admin
- close only active mapping versions created by the run
- never mutate question payloads or delete decisions/events
- disable or revalidate affected standard rollouts
- repeated rollback is idempotent

