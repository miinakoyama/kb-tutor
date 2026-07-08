# Contract: POST /api/short-answer/generate

Runs the Method2 blueprint→item pipeline (no study-guide RAG) and returns **one** complete validated item. Each call to this endpoint performs **two LLM calls** server-side (blueprint, then item), plus up to 3 validation retries per stage. Batch generation ("m short-answer items") is orchestrated client-side by the extended bulk generation screen (`/content/mass-production`), which calls this endpoint once per item (sequential or limited concurrency) so each request stays within timeout bounds and a failed item never discards the others. Saving is a separate client action via existing `addGeneratedQuestionSet`, which merges MCQ and short-answer outputs from the same run into one set; review/deletion of unwanted items happens on the set detail page (same as MCQ).

**Auth**: teacher or admin. Handler re-verifies `supabase.auth.getUser()` + `profiles.role`. Middleware also maps this path to teacher/admin.

## Request

```json
{
  "standardCode": "3.1.9-12.A",
  "fixedCoreKC": "KC-A-03",
  "stimulusType": "table",
  "modelId": "gpt-5.4",
  "temperature": 0.7
}
```

- `standardCode`: required, must exist in `STANDARD_DEFINITIONS` and the bundled KC table.
- `fixedCoreKC`: optional; must be a KC under the standard. When omitted the server selects one.
- `stimulusType`: optional; one of `table | line_graph | bar_chart | diagram | scenario | illustration`. Never `"none"`. When omitted the server selects one.
- `modelId`: one of the generation catalog: `claude-sonnet-4-6`, `claude-opus-4-8`, `gpt-5.4`, `gpt-5.4-mini`, `gemini-3.1-flash-lite-preview`.
- `temperature`: optional, 0–2, default per model catalog.

## Behavior

1. Assemble no-RAG context (KCs, taxonomy, item cards by vocabulary overlap, exemplars, rubric anchors). `studyGuideChunks = []`; no embedding retrieval; `study_guide_chunks.json` is never loaded.
2. Stage 1: blueprint generation (strict JSON), structural validation, retry up to 3 on invalid.
3. Stage 2: item generation from validated blueprint, structural validation (stimulus-type match, rubric sums, annotated responses 0..N, no placeholders, safe SVG for diagrams), retry up to 3.
4. Return blueprint + item + grounding + metadata. Nothing is persisted by this route.

## Response 200

```json
{
  "blueprint": { "targetStandard": "3.1.9-12.A", "anchorKc": "KC-A-03", "...": "..." },
  "item": { "stem": "...", "stimulus": { "type": "table", "title": "...", "tableMarkdown": "..." },
            "parts": [ { "label": "A", "prompt": "...", "taskType": "recall_identify", "maxScore": 1, "rubric": { "pointsPossible": 1, "criteria": { "1": "...", "0": "..." } }, "scoringGuidance": "..." } ],
            "annotatedResponses": [ { "score": 3, "response": "...", "annotation": "..." } ],
            "keyTerms": [ { "term": "...", "definition": "..." } ] },
  "grounding": {
    "study_guide": { "empty": true, "chunk_ids": [] },
    "rubric": { "empty": false, "items": ["..."] },
    "cards": { "empty": false, "card_ids": ["..."] }
  },
  "metadata": {
    "method": "method2_blueprint_no_rag_l3",
    "useBlueprint": true,
    "useStudyGuideRag": false,
    "telerLevel": 3,
    "modelId": "gpt-5.4",
    "temperature": 0.7
  }
}
```

## Errors

| Status | Case |
|---|---|
| 400 | Unknown standard/KC/stimulus type/model |
| 401 / 403 | Unauthenticated / not teacher-or-admin |
| 502 | Pipeline failed after retry budget — `{ "error": "generation_failed", "stage": "blueprint" | "item", "retriable": true }`; no invalid item is ever returned |
