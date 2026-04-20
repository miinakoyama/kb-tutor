-- Documents legacy column; SP visibility is per-question (generated_questions.include_in_self_practice).

comment on column public.school_question_sets.available_for_self_practice is
  'Deprecated: historically gated student SP access at the set level. Self Practice is now controlled per question (generated_questions.include_in_self_practice). This column is written as true for upserts and is not used by RLS; remove in a future migration after code stops referencing it.';
