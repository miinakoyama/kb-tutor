BEGIN;
SELECT plan(17);

SELECT has_table('public', 'bkt_parameter_sets', 'parameter versions exist');
SELECT has_table('public', 'student_kc_mastery', 'current mastery exists');
SELECT has_table('public', 'bkt_mastery_events', 'mastery audit exists');
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.bkt_parameter_sets WHERE active $$,
  ARRAY[2::bigint],
  'one MCQ and one SAQ parameter set are active'
);
SELECT is(
  public.bkt_condition_probability(0.30, true, 0.25, 0.10),
  0.6067415730337079::double precision,
  'MCQ correct posterior matches the golden value'
);
SELECT is(
  public.bkt_condition_probability(0.30, false, 0.25, 0.10),
  0.05405405405405406::double precision,
  'MCQ incorrect posterior matches the golden value'
);
SELECT has_index('public', 'bkt_mastery_events', 'bkt_mastery_events_active_source_uidx', 'active evidence is idempotent');
SELECT has_function('public', 'apply_bkt_observation', ARRAY['text', 'uuid', 'smallint'], 'atomic observation function exists');
SELECT has_function('public', 'rebuild_student_kc_mastery', ARRAY['uuid', 'text'], 'replay function exists');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'bkt-test@example.com', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

INSERT INTO public.generated_question_sets (id, user_id, name, generated_at)
VALUES ('bkt-test-set', '10000000-0000-4000-8000-000000000001', 'BKT test', now());

INSERT INTO public.generated_questions (
  id, set_id, user_id, payload, include_in_self_practice
) VALUES (
  'bkt-mcq', 'bkt-test-set', '10000000-0000-4000-8000-000000000001',
  '{"id":"bkt-mcq","standardId":"3.1.9-12.A","questionType":"mcq","kcCode":"3.1.9-12.A2","text":"Test","options":[{"id":"A","text":"A"}],"correctOptionId":"A"}'::jsonb,
  true
), (
  'bkt-saq', 'bkt-test-set', '10000000-0000-4000-8000-000000000001',
  '{"id":"bkt-saq","standardId":"3.1.9-12.A","questionType":"open-ended","text":"Test","shortAnswer":{"parts":[{"label":"A"},{"label":"B"}],"blueprint":{"taskSequence":{"A":{"kcCode":"3.1.9-12.A3"},"B":{"kcCode":"3.1.9-12.A4"}}}}}'::jsonb,
  true
);

SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.question_kc_assignments WHERE question_set_id = 'bkt-test-set' AND valid_to IS NULL $$,
  ARRAY[3::bigint],
  'question trigger creates one MCQ and two SAQ part mappings'
);

INSERT INTO public.attempts (
  id, user_id, client_attempt_id, question_id, question_set_id,
  selected_option_id, is_correct, mode, answered_at
) VALUES (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'bkt-mcq', 'bkt-test-set', 'A', true, 'practice', now()
);

SELECT is(
  round((SELECT probability::numeric FROM public.student_kc_mastery
    WHERE user_id = '10000000-0000-4000-8000-000000000001' AND kc_code = '3.1.9-12.A2'), 10),
  0.6460674157::numeric,
  'mapped correct MCQ applies the golden BKT transition'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.bkt_mastery_events
     WHERE source_attempt_id = '20000000-0000-4000-8000-000000000001' AND superseded_at IS NULL $$,
  ARRAY[1::bigint],
  'one active source creates one active evidence event'
);

INSERT INTO public.attempts (
  id, user_id, client_attempt_id, question_id, question_set_id,
  selected_option_id, is_correct, mode, answered_at
) VALUES (
  '20000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'bkt-mcq', 'bkt-test-set', 'A', true, 'practice', now()
) ON CONFLICT (client_attempt_id) DO NOTHING;
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.bkt_mastery_events WHERE source_kind = 'mcq_attempt' AND event_type <> 'replay' $$,
  ARRAY[1::bigint],
  'duplicate client attempt does not add evidence'
);

UPDATE public.attempts SET is_correct = false
WHERE id = '20000000-0000-4000-8000-000000000001';
SELECT is(
  round((SELECT probability::numeric FROM public.student_kc_mastery
    WHERE user_id = '10000000-0000-4000-8000-000000000001' AND kc_code = '3.1.9-12.A2'), 10),
  0.1486486486::numeric,
  'rescore replay equals a clean final incorrect sequence'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.bkt_mastery_events
     WHERE source_attempt_id = '20000000-0000-4000-8000-000000000001' AND superseded_at IS NULL $$,
  ARRAY[1::bigint],
  'rescore leaves one active source revision'
);

INSERT INTO public.short_answer_attempts (
  id, user_id, question_id, question_set_id, part_label, attempt_number,
  client_attempt_id, mode, response_text, score, max_score, is_correct,
  feedback, method, answered_at
) VALUES (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'bkt-saq', 'bkt-test-set', 'A', 1,
  '50000000-0000-4000-8000-000000000001', 'practice', 'answer', 2, 2, true,
  '{}'::jsonb, 'none', now()
);
SELECT is(
  round((SELECT probability::numeric FROM public.student_kc_mastery
    WHERE user_id = '10000000-0000-4000-8000-000000000001' AND kc_code = '3.1.9-12.A3'), 10),
  0.8147058824::numeric,
  'full-credit SAQ part applies the SAQ parameter set'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.bkt_mastery_events
     WHERE source_attempt_id = '40000000-0000-4000-8000-000000000001' AND question_format = 'saq' $$,
  ARRAY[1::bigint],
  'SAQ part creates one part-level observation'
);

SELECT * FROM finish();
ROLLBACK;
