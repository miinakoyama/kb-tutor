BEGIN;
SELECT plan(8);

SELECT has_table('public', 'adaptive_rotation_states', 'rotation state exists');
SELECT has_table('public', 'adaptive_selection_events', 'selection audit exists');
SELECT has_index('public', 'adaptive_selection_events', 'adaptive_selection_events_user_standard_idx', 'student/standard history is indexed');
SELECT has_column('public', 'attempts', 'question_completed', 'whole-question completion is tracked separately from raw attempts');
SELECT has_function(
  'public', 'get_adaptive_practice_candidates',
  ARRAY['uuid','text','text'],
  'target-KC candidate query exists'
);
SELECT has_function(
  'public', 'record_adaptive_selection',
  ARRAY['uuid','uuid','text','text','text[]','text','text[]','text','text','text','text','jsonb','bigint'],
  'atomic compare-and-record function exists'
);
SELECT table_privs_are('public', 'adaptive_rotation_states', 'authenticated', ARRAY['SELECT'], 'students cannot mutate rotation directly');
SELECT table_privs_are('public', 'adaptive_selection_events', 'authenticated', ARRAY['SELECT'], 'students cannot forge selection events');

SELECT * FROM finish();
ROLLBACK;
