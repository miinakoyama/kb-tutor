# Capacity Note: Short-Answer Questions (002)

**Feature**: `002-short-answer-questions` | **Date**: 2026-07-08

## LLM calls per operation

| Operation | HTTP requests | LLM calls (typical) | LLM calls (worst case) | Timeout |
|-----------|---------------|---------------------|------------------------|---------|
| Grade — Method 1 | 1 | 1 (+ optional embedding for KB retrieval) | 2 (1 retry) | 60s per call |
| Grade — Method 2 | 1 | 2 (score → feedback) | 4 (1 retry each stage) | 60s per call |
| Grade — Method 3 | 1 | 1 | 2 (1 retry) | 60s per call |
| Grade — empty response | 1 | 0 | 0 | <1s |
| Generate — 1 SAQ item | 1 | 2 (blueprint → item) | 6 (3 retries × 2 stages) | 60s per call |
| Generate — MCQ batch | 1 | 1 (unchanged) | varies | existing |

**Per student submission (practice)**: 1–2 attempts per part × 1–2 LLM calls per attempt (method-dependent). A 3-part item with two wrong-then-correct attempts on Method 2 could reach ~12 LLM calls in the worst case; typical happy path is ~6 calls.

**Per generation run** (e.g. 3 MCQs + 2 SAQs): 1 MCQ batch call + 2 SAQ generate calls (4 LLM calls typical, up to 12 with retries).

## Classroom burst concurrency

- Target: 30+ students submitting within a short window (constitution III).
- Each grade/generate request is stateless; Fluid Compute reuses warm instances.
- At 30 concurrent students on Method 2 (2 calls each): ~60 upstream LLM calls — within normal serverless limits; no queue required at current scale.
- Client shows explicit loading states; grade failures return 502 without consuming the attempt (FR-023).

## Retry behavior

- **Grading**: one automatic retry on LLM failure; if both fail → 502, attempt not persisted.
- **Generation**: up to 3 validation retries per pipeline stage (blueprint, item); budget exhaustion → 502 with `{ stage, retriable: true }`.
- **Mixed-set generation**: a failed SAQ item does not discard other items in the batch; successful items are saved and failures are reported per item.

## Third-party data (Principle V)

Grading and generation send **only** student free-text answers and question content (stem, stimulus, rubrics, annotated responses) to OpenAI, Anthropic, and Google. No student names, emails, IDs, or school identifiers are included in LLM prompts. This is inherent to AI grading and is documented in `plan.md` Complexity Tracking / Constitution Check.

## Reference data

~1.5MB bundled under `src/data/short-answer/`, loaded server-side with module-level caching after first read. No per-request file I/O after warmup.
