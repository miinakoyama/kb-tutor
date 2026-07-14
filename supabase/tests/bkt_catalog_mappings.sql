BEGIN;
SELECT plan(8);

SELECT has_table('public', 'knowledge_components', 'KC catalog exists');
SELECT has_table('public', 'question_kc_assignments', 'mapping history exists');
SELECT col_is_pk('public', 'knowledge_components', 'code', 'KC code is primary key');
SELECT has_index('public', 'knowledge_components', 'knowledge_components_active_order_idx', 'active order is indexed');
SELECT has_index('public', 'question_kc_assignments', 'question_kc_assignments_candidate_idx', 'candidate lookup is indexed');
SELECT function_privs_are(
  'public', 'sync_question_kc_assignments', ARRAY[]::text[], 'anon', ARRAY[]::text[],
  'anonymous users cannot execute the mapping trigger function'
);
SELECT function_privs_are(
  'public', 'sync_question_kc_assignments', ARRAY[]::text[], 'authenticated', ARRAY[]::text[],
  'authenticated users cannot execute the mapping trigger function'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.knowledge_components WHERE active $$,
  ARRAY[106::bigint],
  'all 106 catalog KCs are active'
);

SELECT * FROM finish();
ROLLBACK;
