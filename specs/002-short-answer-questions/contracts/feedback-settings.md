# Contract: /api/feedback-settings

Per-school feedback method/model/temperature configuration plus the system-wide default. Students have no access (settings are resolved server-side during grading).

**Auth**: teacher (own schools) or admin (all schools + default). Re-verified in-handler via `profiles.role` and `school_teachers` membership.

## GET /api/feedback-settings

Returns the settings visible to the caller plus catalog metadata for the editor UI.

```json
{
  "methods": [
    { "method": "1", "label": "Method 1 — Single-call (GradeOpt + KB)", "recommended": { "modelId": "claude-opus-4-8", "temperature": 1 } },
    { "method": "2", "label": "Method 2 — Two-stage (score, then feedback)", "recommended": { "modelId": "gpt-5.4", "temperature": 1 } },
    { "method": "3", "label": "Method 3 — Error-analysis-first (boundary examples)", "recommended": { "modelId": "claude-sonnet-4-6", "temperature": 0 } }
  ],
  "models": [ { "id": "claude-opus-4-8", "label": "Claude Opus 4.8", "provider": "anthropic" } ],
  "default": { "method": "2", "modelId": "gpt-5.4", "temperature": 1, "editable": false },
  "schools": [
    { "schoolId": "uuid", "schoolName": "Biology P3", "setting": { "method": "3", "modelId": "claude-sonnet-4-6", "temperature": 0 }, "inherited": false },
    { "schoolId": "uuid", "schoolName": "Biology P5", "setting": null, "inherited": true }
  ]
}
```

- `default.editable` is `true` only for admins.
- `setting: null` + `inherited: true` → school currently follows the default.

## PUT /api/feedback-settings

```json
{ "scope": "school", "schoolId": "uuid", "method": "3", "modelId": "claude-sonnet-4-6", "temperature": 0 }
```

or (admin only): `{ "scope": "default", "method": "2", "modelId": "gpt-5.4", "temperature": 1 }`

Behavior:
- Upserts the row; validates `method`, `modelId` ∈ catalog, `temperature` 0–2.
- When the client switches method without editing model/temperature, the UI pre-fills that method's recommended defaults (FR-025); the server accepts any valid combination.
- A school row may be deleted via `{ "scope": "school", "schoolId": "...", "reset": true }` → school reverts to the default.
- Takes effect on the next grade request — the grade route reads settings per submission (FR-026); in-flight submissions keep the config captured at submission time.

Errors: 400 invalid values; 401/403 role or school-membership failure; teachers cannot touch `scope: "default"` (403).
