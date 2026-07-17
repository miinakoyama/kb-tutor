BEGIN;
SELECT plan(35);

SELECT has_table('public', 'kc_classification_runs', 'classification runs exist');
SELECT has_table('public', 'kc_classification_decisions', 'classification decisions exist');
SELECT has_table('public', 'bkt_standard_rollouts', 'rollout gates exist');
SELECT has_view('public', 'bkt_question_coverage', 'coverage view exists');
SELECT has_function('public', 'publish_kc_classification_run', ARRAY['uuid', 'uuid'], 'publish function exists');
SELECT has_function('public', 'rollback_kc_classification_run', ARRAY['uuid', 'uuid'], 'rollback function exists');
SELECT has_function('public', 'validate_bkt_standard_rollout', ARRAY['text', 'uuid'], 'validation function exists');
SELECT has_function('public', 'set_bkt_standard_rollout', ARRAY['text', 'uuid', 'boolean', 'text'], 'rollout state function exists');
SELECT has_function('public', 'replace_question_kc_mapping', ARRAY['text', 'text', 'text', 'text', 'uuid'], 'atomic mapping replacement function exists');
SELECT has_function('public', 'withdraw_question_kc_mapping', ARRAY['text', 'text', 'text', 'uuid'], 'atomic mapping withdrawal function exists');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '74000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'bkt-classification-test@example.com', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);
UPDATE public.profiles SET role = 'admin'
WHERE id = '74000000-0000-4000-8000-000000000001';

INSERT INTO public.generated_question_sets (id, user_id, name, generated_at)
VALUES (
  'bkt-classification-test-set',
  '74000000-0000-4000-8000-000000000001',
  'BKT classification test',
  now()
);

INSERT INTO public.generated_questions (
  id, set_id, user_id, payload, include_in_self_practice
) VALUES (
  'legacy-mcq', 'bkt-classification-test-set',
  '74000000-0000-4000-8000-000000000001',
  '{"id":"legacy-mcq","standardId":"3.1.9-12.A","questionType":"mcq","text":"Legacy question"}'::jsonb,
  false
);

INSERT INTO public.kc_classification_runs (
  id, status, classifier_a_model, classifier_b_model,
  classifier_a_prompt_version, classifier_b_prompt_version, target_count,
  completed_count, agreement_count, created_by
) VALUES (
  '74000000-0000-4000-8000-000000000002', 'preview_complete',
  'model-a', 'model-b', 'prompt-a', 'prompt-b', 1, 1, 1,
  '74000000-0000-4000-8000-000000000001'
);

INSERT INTO public.kc_classification_decisions (
  run_id, question_set_id, question_id, pass, model_id, prompt_version,
  source_content_hash, outcome, kc_code, rationale
)
SELECT
  '74000000-0000-4000-8000-000000000002',
  'bkt-classification-test-set', 'legacy-mcq', pass,
  CASE pass WHEN 1 THEN 'model-a' ELSE 'model-b' END,
  CASE pass WHEN 1 THEN 'prompt-a' ELSE 'prompt-b' END,
  public.bkt_question_content_hash(q.payload), 'assigned', '3.1.9-12.A1', 'Agreement'
FROM public.generated_questions q
CROSS JOIN generate_series(1, 2) AS pass
WHERE q.set_id = 'bkt-classification-test-set' AND q.id = 'legacy-mcq';

SELECT results_eq(
  $$ SELECT published_count FROM public.publish_kc_classification_run(
    '74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000001'
  ) $$,
  ARRAY[1],
  'publish executes without ambiguous output columns'
);
SELECT results_eq(
  $$ SELECT count(*)::integer FROM public.publish_kc_classification_run(
    '74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000001'
  ) $$,
  ARRAY[0],
  'republishing an unchanged run is idempotent'
);
SELECT results_eq(
  $$ SELECT count(*)::integer FROM public.question_kc_assignments
     WHERE classification_run_id = '74000000-0000-4000-8000-000000000002'
       AND valid_to IS NULL $$,
  ARRAY[1],
  'publication creates one active run mapping'
);
SELECT is(
  (SELECT payload->>'kcCode' FROM public.generated_questions
   WHERE set_id = 'bkt-classification-test-set' AND id = 'legacy-mcq'),
  '3.1.9-12.A1',
  'publication persists the classified KC in the question payload'
);
SELECT is(
  (SELECT provenance FROM public.question_kc_assignments
   WHERE question_set_id = 'bkt-classification-test-set'
     AND question_id = 'legacy-mcq' AND valid_to IS NULL),
  'model',
  'publication retains model provenance on the trigger-created mapping'
);

UPDATE public.generated_questions
SET include_in_self_practice = true
WHERE set_id = 'bkt-classification-test-set' AND id = 'legacy-mcq';
SELECT is(
  (SELECT include_in_self_practice FROM public.generated_questions
   WHERE set_id = 'bkt-classification-test-set' AND id = 'legacy-mcq'),
  true,
  'published question can be included in Self Practice without changing content'
);
SELECT results_eq(
  $$ SELECT count(*)::integer FROM public.question_kc_assignments
     WHERE classification_run_id = '74000000-0000-4000-8000-000000000002'
       AND valid_to IS NULL
       AND provenance = 'model' $$,
  ARRAY[1],
  'Self Practice toggle preserves the active published-run mapping'
);

INSERT INTO public.generated_questions (
  id, set_id, user_id, payload, include_in_self_practice
)
SELECT
  'coverage-' || kc.catalog_order,
  'bkt-classification-test-set',
  '74000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'id', 'coverage-' || kc.catalog_order,
    'standardId', kc.standard_id,
    'questionType', 'mcq',
    'kcCode', kc.code,
    'text', 'Coverage question ' || kc.catalog_order
  ),
  true
FROM public.knowledge_components kc
WHERE kc.standard_id = '3.1.9-12.A' AND kc.active;

SELECT is(
  (SELECT status FROM public.validate_bkt_standard_rollout(
    '3.1.9-12.A', '74000000-0000-4000-8000-000000000001'
  )),
  'ready',
  'complete Self Practice coverage passes preflight'
);
SELECT is(
  (SELECT status FROM public.set_bkt_standard_rollout(
    '3.1.9-12.A', '74000000-0000-4000-8000-000000000001', true, NULL
  )),
  'enabled',
  'a ready standard can be enabled with one function evaluation'
);

CREATE TEMP TABLE rollout_hash_before AS
SELECT coverage_hash FROM public.bkt_standard_rollouts WHERE standard_id = '3.1.9-12.A';
UPDATE public.generated_questions
SET payload = jsonb_set(payload, '{text}', '"Revised coverage question"'::jsonb)
WHERE set_id = 'bkt-classification-test-set' AND id = 'coverage-1';
SELECT is(
  (SELECT status FROM public.set_bkt_standard_rollout(
    '3.1.9-12.A', '74000000-0000-4000-8000-000000000001', true, NULL
  )),
  'enabled',
  'enable revalidates valid content changes at the rollout boundary'
);
SELECT isnt(
  (SELECT coverage_hash FROM public.bkt_standard_rollouts WHERE standard_id = '3.1.9-12.A'),
  (SELECT coverage_hash FROM rollout_hash_before),
  'rollout validation hash changes with eligible question content'
);

SELECT is(
  public.rollback_kc_classification_run(
    '74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000001'
  ),
  1,
  'rollback closes the published run mapping'
);
SELECT ok(
  NOT (SELECT payload ? 'kcCode' FROM public.generated_questions
       WHERE set_id = 'bkt-classification-test-set' AND id = 'legacy-mcq'),
  'rollback removes the published KC from the question payload'
);
SELECT is(
  (SELECT include_in_self_practice FROM public.generated_questions
   WHERE set_id = 'bkt-classification-test-set' AND id = 'legacy-mcq'),
  false,
  'rollback excludes the now-unmapped question from Self Practice'
);
SELECT is(
  public.rollback_kc_classification_run(
    '74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000001'
  ),
  0,
  'repeated rollback is idempotent'
);

SELECT is(
  (public.replace_question_kc_mapping(
    'bkt-classification-test-set',
    'coverage-1',
    NULL,
    '3.1.9-12.A2',
    '74000000-0000-4000-8000-000000000001'
  )->>'mappingChanged')::boolean,
  true,
  'admin replacement succeeds atomically'
);
SELECT is(
  (SELECT payload->>'kcCode' FROM public.generated_questions
   WHERE set_id = 'bkt-classification-test-set' AND id = 'coverage-1'),
  '3.1.9-12.A2',
  'admin replacement persists the KC in the question payload'
);
UPDATE public.generated_questions
SET payload = jsonb_set(payload, '{text}', '"Edited after replacement"'::jsonb)
WHERE set_id = 'bkt-classification-test-set' AND id = 'coverage-1';
SELECT is(
  (SELECT kc_code FROM public.question_kc_assignments
   WHERE question_set_id = 'bkt-classification-test-set'
     AND question_id = 'coverage-1'
     AND part_label IS NULL
     AND valid_to IS NULL
     AND status = 'confirmed'),
  '3.1.9-12.A2',
  'later question edits preserve the admin-selected KC'
);
SELECT is(
  (public.withdraw_question_kc_mapping(
    'bkt-classification-test-set',
    'coverage-1',
    NULL,
    '74000000-0000-4000-8000-000000000001'
  )->>'mappingChanged')::boolean,
  true,
  'admin withdrawal succeeds atomically'
);
SELECT ok(
  NOT (SELECT payload ? 'kcCode' FROM public.generated_questions
       WHERE set_id = 'bkt-classification-test-set' AND id = 'coverage-1'),
  'admin withdrawal removes the embedded KC'
);
SELECT is(
  (SELECT include_in_self_practice FROM public.generated_questions
   WHERE set_id = 'bkt-classification-test-set' AND id = 'coverage-1'),
  false,
  'admin withdrawal excludes the question from Self Practice'
);
SELECT results_eq(
  $$ SELECT count(*)::integer FROM public.question_kc_assignments
     WHERE question_set_id = 'bkt-classification-test-set'
       AND question_id = 'coverage-1'
       AND valid_to IS NULL $$,
  ARRAY[0],
  'admin withdrawal leaves no open mapping that a later edit can revive'
);

INSERT INTO public.generated_questions (
  id, set_id, user_id, payload, include_in_self_practice
) VALUES (
  'coverage-saq',
  'bkt-classification-test-set',
  '74000000-0000-4000-8000-000000000001',
  '{
    "id":"coverage-saq",
    "standardId":"3.1.9-12.A",
    "questionType":"open-ended",
    "text":"SAQ coverage question",
    "shortAnswer":{
      "parts":[{"label":"A"},{"label":"B"}],
      "blueprint":{"taskSequence":{
        "A":{"kcCode":"3.1.9-12.A3"},
        "B":{"kcCode":"3.1.9-12.A4"}
      }}
    }
  }'::jsonb,
  true
);
SELECT is(
  (public.replace_question_kc_mapping(
    'bkt-classification-test-set',
    'coverage-saq',
    'A',
    '3.1.9-12.A2',
    '74000000-0000-4000-8000-000000000001'
  )->>'mappingChanged')::boolean,
  true,
  'admin can atomically replace one SAQ part mapping'
);
SELECT is(
  (SELECT payload#>>'{shortAnswer,blueprint,taskSequence,A,kcCode}'
   FROM public.generated_questions
   WHERE set_id = 'bkt-classification-test-set' AND id = 'coverage-saq'),
  '3.1.9-12.A2',
  'SAQ replacement persists the part KC in the nested payload'
);
UPDATE public.generated_questions
SET payload = jsonb_set(payload, '{text}', '"Edited SAQ after replacement"'::jsonb)
WHERE set_id = 'bkt-classification-test-set' AND id = 'coverage-saq';
SELECT is(
  (SELECT kc_code FROM public.question_kc_assignments
   WHERE question_set_id = 'bkt-classification-test-set'
     AND question_id = 'coverage-saq'
     AND part_label = 'A'
     AND valid_to IS NULL
     AND status = 'confirmed'),
  '3.1.9-12.A2',
  'later SAQ edits preserve the admin-selected part KC'
);

SELECT * FROM finish();
ROLLBACK;
