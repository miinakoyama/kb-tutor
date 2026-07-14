# T028 — Legacy KC Classification Preview

**Status:** Complete (preview only — no mappings published)
**Date:** 2026-07-12
**Run ID:** `34621e5e-d565-4254-9d29-255a1a025461`
**Environment:** Local non-production Supabase (`127.0.0.1:54322`)

## Operator approval

Operator (repository owner) explicitly approved running the preview and directed
the use of GPT models. Estimated cost was well under $0.05 for the 24-item sample
(see Measured usage). No production data was touched and no mappings were published
(`Active mappings changed: 0`).

## Sample

The production database holds the real unmapped legacy questions, but they are not
accessible from this environment, and the local DB had been reset to empty. To run a
faithful **non-production** preview, a representative sample of **24 legacy-style MCQs**
was seeded into the local DB, spanning **8 standards** (3 questions each):

`3.1.9-12.A, .B, .C, .D, .E, .F, .G, .P`

All 24 were inserted with `include_in_self_practice = false` (unmapped), which the
coverage view reports as `excluded` — the same state genuine unmapped legacy MCQs
occupy before classification. This exceeds the ≥20-MCQ requirement.

> Note on representativeness: because production content is not reachable here, the
> measured **agreement rate reflects this seeded sample, not production**. A fresh
> preview against a production snapshot in a non-prod project is still required before
> any production publish (tracked by the production runbook / T074).

## Models & prompt

| Role | Model | Prompt version |
|------|-------|----------------|
| Pass A (classifier A) | `gpt-5.4-mini` | `legacy-kc-v1` |
| Pass B (classifier B) | `gpt-5.4` | `legacy-kc-v1` |

Two distinct GPT models were used so the two-model agreement gate remains meaningful
while honoring the operator's instruction to use GPT. (The script default remains
GPT + Gemini; models were overridden for this run via
`BKT_CLASSIFIER_MODEL_A` / `BKT_CLASSIFIER_MODEL_B`.)

Command:

```
BKT_CLASSIFIER_MODEL_A=gpt-5.4-mini BKT_CLASSIFIER_MODEL_B=gpt-5.4 \
  npm run bkt:classify -- --sets legacy-preview-set --actor <admin-uuid> --verbose
```

## Results

| Metric | Value |
|--------|-------|
| Targeted | 24 |
| Completed (both passes) | 24 |
| **Agreed (identical assigned KC)** | **22 (91.7%)** |
| Disagreed / ambiguous | 2 |
| Invalid (schema/parse failures) | 0 |
| Classifier errors | 0 |
| Active mappings changed | 0 (preview) |

### Agreement by standard

All items in standards A, B, C, E, F, G, P agreed. The two non-agreements are detailed
below; both are genuine borderline/mismatch cases where the disagreement gate correctly
prevented an automatic mapping.

### Non-agreement cases

**`legacy-preview-002`** — "Enzyme loses function after an active-site amino-acid mutation."
- Pass A (`gpt-5.4-mini`): `assigned → 3.1.9-12.A5` (shape determines function).
- Pass B (`gpt-5.4`): `ambiguous` — equally central to A4 (sequence → shape) and A5 (shape → function).
- Verdict: legitimately ambiguous; excluded from auto-mapping. Would need human review.

**`legacy-preview-010`** — "K+ gradient maintained 20× higher inside the cell." (the real
legacy bundled-bank item, historically mis-topiced under standard D)
- Pass A (`gpt-5.4-mini`): `assigned → 3.1.9-12.D5` but its rationale flags that the item
  is about membrane transport, not the listed mitosis/development KCs.
- Pass B (`gpt-5.4`): `invalid` — none of the supplied D KCs address transport.
- Verdict: content/standard mismatch correctly caught. This item should be re-labeled to a
  transport-related standard rather than force-mapped to D. Good demonstration that the
  gate does **not** manufacture a mapping for out-of-catalog content.

## Measured usage

| | Value |
|---|---|
| Input tokens (both passes) | 17,724 |
| Output tokens (both passes) | 2,223 |
| Approx. cost (illustrative rates) | ~$0.027 total (~$0.0011 / question) |

## Conclusions

- The pipeline runs end-to-end in preview mode with **no writes to active mappings**.
- Schema validation and per-model token accounting worked (0 parse/schema failures).
- The two-model agreement gate behaved as designed: it auto-agreed on clear items and
  withheld the two genuinely ambiguous / mismatched items instead of guessing.
- 91.7% agreement on this representative sample is encouraging, but a **production-snapshot
  preview is still required** (see T074 / production runbook) before any production publish.
