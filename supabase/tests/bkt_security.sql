BEGIN;
SELECT plan(12);

SELECT table_privs_are('public', 'knowledge_components', 'authenticated', ARRAY['SELECT'], 'catalog is read-only to clients');
SELECT table_privs_are('public', 'question_kc_assignments', 'authenticated', ARRAY['SELECT'], 'mappings are read-only to clients');
SELECT table_privs_are('public', 'bkt_parameter_sets', 'authenticated', ARRAY['SELECT'], 'parameters are read-only to clients');
SELECT table_privs_are('public', 'student_kc_mastery', 'authenticated', ARRAY['SELECT'], 'mastery is read-only to clients');
SELECT table_privs_are('public', 'bkt_mastery_events', 'authenticated', ARRAY['SELECT'], 'events are read-only to clients');
SELECT table_privs_are('public', 'kc_classification_runs', 'authenticated', ARRAY['SELECT'], 'runs are read-only to admins through RLS');
SELECT table_privs_are('public', 'kc_classification_decisions', 'authenticated', ARRAY['SELECT'], 'decisions are read-only to admins through RLS');
SELECT table_privs_are('public', 'bkt_standard_rollouts', 'authenticated', ARRAY['SELECT'], 'rollouts are read-only to clients');
SELECT function_privs_are('public', 'apply_bkt_observation', ARRAY['text','uuid','smallint'], 'authenticated', ARRAY[]::text[], 'clients cannot apply mastery directly');
SELECT function_privs_are('public', 'record_adaptive_selection', ARRAY['uuid','uuid','text','text','text[]','text','text[]','text','text','text','text','jsonb','bigint'], 'authenticated', ARRAY[]::text[], 'clients cannot forge selections');
SELECT function_privs_are('public', 'publish_kc_classification_run', ARRAY['uuid','uuid'], 'authenticated', ARRAY[]::text[], 'clients cannot publish classification runs');
SELECT function_privs_are('public', 'set_bkt_standard_rollout', ARRAY['text','uuid','boolean','text'], 'authenticated', ARRAY[]::text[], 'clients cannot enable standards');

SELECT * FROM finish();
ROLLBACK;
