-- Backfill legacy manually-authored question sets that were saved before
-- generation_model_* metadata was populated. We only tag sets as Manual when
-- every persisted question payload in the set declares source = 'manual'.
update public.generated_question_sets as gqs
set
  generation_model_id = 'manual',
  generation_model_label = 'Manual'
where coalesce(gqs.generation_model_id, '') = ''
  and coalesce(gqs.generation_model_label, '') = ''
  and exists (
    select 1
    from public.generated_questions as gq
    where gq.set_id = gqs.id
  )
  and not exists (
    select 1
    from public.generated_questions as gq
    where gq.set_id = gqs.id
      and coalesce(gq.payload ->> 'source', '') <> 'manual'
  );
