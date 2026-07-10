# Contract: /api/feedback-reports

Student reports of wrong/confusing AI feedback, and the teacher review flow.

## POST /api/feedback-reports (student)

**Auth**: authenticated; the report is recorded for `auth.uid()` and must reference the caller's own attempt.

```json
{ "attemptId": "uuid", "note": "The feedback says I talked about warmth but I didn't." }
```

- `note` optional (≤1000 chars).
- 409 if this attempt is already reported by this student (UI shows "Reported" state from local + fetched state).
- Response 201: `{ "reportId": "uuid" }`.

## GET /api/feedback-reports (teacher/admin)

**Auth**: teacher (reports from students in own schools) or admin (all). Query: `?status=unreviewed|reviewed|all&schoolId=uuid&limit&offset`.

```json
{
  "reports": [
    {
      "id": "uuid",
      "createdAt": "2026-07-08T12:00:00Z",
      "student": { "id": "uuid", "displayName": "..." },
      "questionId": "sa-0001",
      "questionPreview": "A researcher investigated how stomata...",
      "partLabel": "A",
      "note": "…",
      "attempt": {
        "responseText": "…",
        "score": 0, "maxScore": 1,
        "feedback": { "verdict": "incorrect", "segments": [ { "label": "Try this", "text": "…" } ] },
        "method": "2", "modelId": "gpt-5.4", "confidence": null
      },
      "reviewedAt": null
    }
  ],
  "total": 12
}
```

## PATCH /api/feedback-reports (teacher/admin)

```json
{ "reportId": "uuid", "reviewed": true }
```

Sets/clears `reviewed_at` + `reviewed_by`. Reviewed reports remain fetchable with `status=reviewed` (US4 scenario 2). Errors: 401/403 scope violations, 404 unknown report.
