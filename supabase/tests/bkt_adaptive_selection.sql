BEGIN;
SELECT plan(6);

SELECT has_table('public', 'adaptive_rotation_states', 'rotation state exists');
SELECT has_table('public', 'adaptive_selection_events', 'selection audit exists');
SELECT has_index('public', 'adaptive_selection_events', 'adaptive_selection_events_user_standard_idx', 'student/standard history is indexed');
SELECT has_function(
  'public', 'record_adaptive_selection',
  ARRAY['uuid','uuid','text','text','text[]','text','text[]','text','text','text','text','jsonb','bigint'],
  'atomic compare-and-record function exists'
);
SELECT table_privs_are('public', 'adaptive_rotation_states', 'authenticated', ARRAY['SELECT'], 'students cannot mutate rotation directly');
SELECT table_privs_are('public', 'adaptive_selection_events', 'authenticated', ARRAY['SELECT'], 'students cannot forge selection events');

SELECT * FROM finish();
ROLLBACK;
