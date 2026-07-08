# Contract: student notes

## Writes — browser Supabase client (no API route)

`student_question_notes` upsert on blur (debounced ~400ms) from `CompletionSection` and the `/my-notes` detail view, using `getSupabaseBrowserClient()` under RLS (`user_id = auth.uid()`):

```ts
supabase.from("student_question_notes")
  .upsert({ user_id, question_id, note_text }, { onConflict: "user_id,question_id" });
```

Matches the existing `user_settings` browser-write pattern. Empty `note_text` deletes the row.

## GET /api/student-notes

**Auth**: authenticated; returns only the caller's notes. Server joins question payloads for previews (payloads are not directly readable client-side for other users' sets).

Query: `?limit&offset` (newest `updated_at` first).

```json
{
  "notes": [
    {
      "questionId": "sa-0001",
      "noteText": "The main idea was transpiration measurement…",
      "updatedAt": "2026-07-08T12:00:00Z",
      "question": { "topic": "Ecosystems", "preview": "A researcher investigated how stomata…", "available": true }
    }
  ],
  "total": 4
}
```

- `question.available: false` when the underlying question was deleted; the note still renders with its text and topic snapshot absent (UI shows "Question no longer available").
- Opening a note navigates to a review view of that question with the completion section (and the note) visible; edits use the same upsert path.
