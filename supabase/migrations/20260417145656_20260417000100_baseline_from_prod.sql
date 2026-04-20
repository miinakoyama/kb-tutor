


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'student',
    'teacher',
    'admin'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_school_question_set_row"("p_school_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = p_school_id AND s.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.school_teachers st
    WHERE st.school_id = p_school_id AND st.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.school_members sm
    WHERE sm.school_id = p_school_id AND sm.student_user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."can_access_school_question_set_row"("p_school_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_student"("student" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.school_members sm
    JOIN public.schools s ON s.id = sm.school_id
    LEFT JOIN public.school_teachers st ON st.school_id = s.id
    WHERE sm.student_user_id = student
      AND (s.teacher_user_id = auth.uid() OR st.teacher_user_id = auth.uid())
  );
$$;


ALTER FUNCTION "public"."can_access_student"("student" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_school_question_sets_for_school"("p_school_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = p_school_id AND s.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.school_teachers st
    WHERE st.school_id = p_school_id AND st.teacher_user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."can_manage_school_question_sets_for_school"("p_school_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_write_school_teachers_for_school"("p_school_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.schools s
    WHERE s.id = p_school_id
      AND s.teacher_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.school_teachers st
    WHERE st.school_id = p_school_id
      AND st.teacher_user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."can_write_school_teachers_for_school"("p_school_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_role"() RETURNS "public"."app_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."current_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_auth_user_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  inferred_role public.app_role;
  inferred_student_id text;
  inferred_display_name text;
begin
  inferred_role := public.resolve_app_role(
    coalesce(new.raw_user_meta_data->>'role', new.raw_app_meta_data->>'role')
  );
  inferred_student_id := nullif(new.raw_user_meta_data->>'student_id', '');
  inferred_display_name := nullif(new.raw_user_meta_data->>'display_name', '');

  insert into public.profiles (
    id,
    email,
    student_id,
    display_name,
    role
  ) values (
    new.id,
    coalesce(new.email, new.id::text || '@student.local'),
    inferred_student_id,
    inferred_display_name,
    inferred_role
  )
  on conflict (id) do update set
    email = excluded.email,
    student_id = coalesce(public.profiles.student_id, excluded.student_id),
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    role = public.profiles.role;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_auth_user_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coalesce(public.current_role() = 'admin', false);
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_teacher"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT coalesce(public.current_role() = 'teacher', false);
$$;


ALTER FUNCTION "public"."is_teacher"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_app_role"("raw_role" "text") RETURNS "public"."app_role"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  if raw_role = 'admin' then
    return 'admin';
  elsif raw_role = 'teacher' then
    return 'teacher';
  else
    return 'student';
  end if;
end;
$$;


ALTER FUNCTION "public"."resolve_app_role"("raw_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."student_is_member_of_school"("p_school_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_members sm
    WHERE sm.school_id = p_school_id AND sm.student_user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."student_is_member_of_school"("p_school_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_generated_question_include_sp"("p_set_id" "text", "p_question_id" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_next boolean;
BEGIN
  UPDATE public.generated_questions
  SET include_in_self_practice = NOT COALESCE(include_in_self_practice, false)
  WHERE set_id = p_set_id AND id = p_question_id
  RETURNING include_in_self_practice INTO v_next;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_next;
END;
$$;


ALTER FUNCTION "public"."toggle_generated_question_include_sp"("p_set_id" "text", "p_question_id" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."assignment_question_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "text" NOT NULL,
    "order_index" integer NOT NULL,
    "question_id" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assignment_question_snapshots_source_type_check" CHECK (("source_type" = ANY (ARRAY['existing_set'::"text", 'generated_now'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."assignment_question_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_targets" (
    "assignment_id" "text" NOT NULL,
    "student_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."assignment_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "school_id" "text" NOT NULL,
    "due_date" timestamp with time zone,
    "module_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "topics" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "target_minutes" integer DEFAULT 20 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "assignment_id" "text",
    "question_id" "text" NOT NULL,
    "selected_option_id" "text" NOT NULL,
    "is_correct" boolean NOT NULL,
    "mode" "text" NOT NULL,
    "module" integer,
    "topic" "text",
    "standard_id" "text",
    "standard_label" "text",
    "time_spent_sec" integer,
    "answered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookmarks" (
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "question_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bookmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_question_sets" (
    "id" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "generated_at" timestamp with time zone NOT NULL,
    "generation_model_id" "text",
    "generation_model_label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."generated_question_sets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_questions" (
    "id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "payload" "jsonb" NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "include_in_self_practice" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."generated_questions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."generated_questions"."include_in_self_practice" IS 'When true, students may see this row in Self Practice if the set is linked with available_for_self_practice.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "student_id" "text",
    "display_name" "text",
    "role" "public"."app_role" DEFAULT 'student'::"public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_student_or_email" CHECK ((("student_id" IS NOT NULL) OR ("email" IS NOT NULL)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_members" (
    "school_id" "text" NOT NULL,
    "student_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."school_question_sets" (
    "school_id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "available_for_self_practice" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."school_question_sets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."school_question_sets"."available_for_self_practice" IS 'Deprecated: historically gated student SP access at the set level. Self Practice is now controlled per question (generated_questions.include_in_self_practice). This column is written as true for upserts and is not used by RLS; remove in a future migration after code stops referencing it.';



CREATE TABLE IF NOT EXISTS "public"."school_teachers" (
    "school_id" "text" NOT NULL,
    "teacher_user_id" "uuid" NOT NULL,
    "teacher_role" "text" DEFAULT 'primary'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "class_teachers_teacher_role_check" CHECK (("teacher_role" = ANY (ARRAY['primary'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."school_teachers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schools" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "grade" smallint,
    "teacher_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."schools" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."teacher_dashboard_standard_metrics" AS
 SELECT "s"."teacher_user_id",
    "a"."user_id" AS "student_user_id",
    "a"."standard_id",
    "max"("a"."standard_label") AS "standard_label",
    "count"(*) AS "attempted",
    "count"(*) FILTER (WHERE "a"."is_correct") AS "correct",
    ("round"(
        CASE
            WHEN ("count"(*) = 0) THEN (0)::numeric
            ELSE ((("count"(*) FILTER (WHERE "a"."is_correct"))::numeric / ("count"(*))::numeric) * (100)::numeric)
        END))::integer AS "accuracy",
    ("round"("avg"(COALESCE("a"."time_spent_sec", 0))))::integer AS "average_time_sec"
   FROM (("public"."attempts" "a"
     JOIN "public"."school_members" "sm" ON (("sm"."student_user_id" = "a"."user_id")))
     JOIN "public"."schools" "s" ON (("s"."id" = "sm"."school_id")))
  GROUP BY "s"."teacher_user_id", "a"."user_id", "a"."standard_id";


ALTER VIEW "public"."teacher_dashboard_standard_metrics" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."teacher_dashboard_student_metrics" AS
 SELECT "s"."teacher_user_id",
    "a"."user_id" AS "student_user_id",
    "count"(*) AS "total_answered",
    "count"(*) FILTER (WHERE "a"."is_correct") AS "total_correct",
    ("round"(
        CASE
            WHEN ("count"(*) = 0) THEN (0)::numeric
            ELSE ((("count"(*) FILTER (WHERE "a"."is_correct"))::numeric / ("count"(*))::numeric) * (100)::numeric)
        END))::integer AS "accuracy"
   FROM (("public"."attempts" "a"
     JOIN "public"."school_members" "sm" ON (("sm"."student_user_id" = "a"."user_id")))
     JOIN "public"."schools" "s" ON (("s"."id" = "sm"."school_id")))
  GROUP BY "s"."teacher_user_id", "a"."user_id";


ALTER VIEW "public"."teacher_dashboard_student_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "tts_rate" numeric(3,2),
    "auto_read_question" boolean,
    "auto_read_choices" boolean,
    "auto_read_feedback" boolean,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."assignment_question_snapshots"
    ADD CONSTRAINT "assignment_question_snapshots_assignment_id_order_index_key" UNIQUE ("assignment_id", "order_index");



ALTER TABLE ONLY "public"."assignment_question_snapshots"
    ADD CONSTRAINT "assignment_question_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_targets"
    ADD CONSTRAINT "assignment_targets_pkey" PRIMARY KEY ("assignment_id", "student_user_id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attempts"
    ADD CONSTRAINT "attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("user_id", "question_id");



ALTER TABLE ONLY "public"."school_members"
    ADD CONSTRAINT "class_members_pkey" PRIMARY KEY ("school_id", "student_user_id");



ALTER TABLE ONLY "public"."school_teachers"
    ADD CONSTRAINT "class_teachers_pkey" PRIMARY KEY ("school_id", "teacher_user_id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_question_sets"
    ADD CONSTRAINT "generated_question_sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_questions"
    ADD CONSTRAINT "generated_questions_pkey" PRIMARY KEY ("set_id", "id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_question_sets"
    ADD CONSTRAINT "school_question_sets_pkey" PRIMARY KEY ("school_id", "set_id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id");



CREATE INDEX "idx_assignment_question_snapshots_assignment" ON "public"."assignment_question_snapshots" USING "btree" ("assignment_id", "order_index");



CREATE INDEX "idx_assignment_targets_student" ON "public"."assignment_targets" USING "btree" ("student_user_id");



CREATE INDEX "idx_assignments_school" ON "public"."assignments" USING "btree" ("school_id");



CREATE INDEX "idx_attempts_assignment" ON "public"."attempts" USING "btree" ("assignment_id");



CREATE INDEX "idx_attempts_standard" ON "public"."attempts" USING "btree" ("standard_id");



CREATE INDEX "idx_attempts_user_answered_at" ON "public"."attempts" USING "btree" ("user_id", "answered_at" DESC);



CREATE INDEX "idx_bookmarks_user" ON "public"."bookmarks" USING "btree" ("user_id");



CREATE INDEX "idx_generated_questions_user" ON "public"."generated_questions" USING "btree" ("user_id", "set_id");



CREATE INDEX "idx_generated_sets_user" ON "public"."generated_question_sets" USING "btree" ("user_id", "generated_at" DESC);



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_student_id" ON "public"."profiles" USING "btree" ("student_id");



CREATE INDEX "idx_school_members_student" ON "public"."school_members" USING "btree" ("student_user_id");



CREATE INDEX "idx_school_question_sets_school" ON "public"."school_question_sets" USING "btree" ("school_id");



CREATE INDEX "idx_school_question_sets_set" ON "public"."school_question_sets" USING "btree" ("set_id");



CREATE INDEX "idx_school_teachers_teacher" ON "public"."school_teachers" USING "btree" ("teacher_user_id", "school_id");



CREATE INDEX "idx_schools_teacher" ON "public"."schools" USING "btree" ("teacher_user_id");



CREATE OR REPLACE TRIGGER "trg_generated_questions_updated_at" BEFORE UPDATE ON "public"."generated_questions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_settings_updated_at" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."assignment_question_snapshots"
    ADD CONSTRAINT "assignment_question_snapshots_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_targets"
    ADD CONSTRAINT "assignment_targets_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_targets"
    ADD CONSTRAINT "assignment_targets_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attempts"
    ADD CONSTRAINT "attempts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attempts"
    ADD CONSTRAINT "attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookmarks"
    ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_members"
    ADD CONSTRAINT "class_members_class_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_members"
    ADD CONSTRAINT "class_members_student_user_id_fkey" FOREIGN KEY ("student_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_teachers"
    ADD CONSTRAINT "class_teachers_class_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_teachers"
    ADD CONSTRAINT "class_teachers_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "classes_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_question_sets"
    ADD CONSTRAINT "generated_question_sets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_questions"
    ADD CONSTRAINT "generated_questions_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "public"."generated_question_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_questions"
    ADD CONSTRAINT "generated_questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_question_sets"
    ADD CONSTRAINT "school_question_sets_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."school_question_sets"
    ADD CONSTRAINT "school_question_sets_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "public"."generated_question_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."assignment_question_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_targets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assignment_targets_read_scoped" ON "public"."assignment_targets" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("student_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."assignments" "a"
  WHERE (("a"."id" = "assignment_targets"."assignment_id") AND ("a"."created_by" = "auth"."uid"()))))));



CREATE POLICY "assignment_targets_write_teacher_admin" ON "public"."assignment_targets" TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."assignments" "a"
  WHERE (("a"."id" = "assignment_targets"."assignment_id") AND ("a"."created_by" = "auth"."uid"())))))) WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."assignments" "a"
  WHERE (("a"."id" = "assignment_targets"."assignment_id") AND ("a"."created_by" = "auth"."uid"()))))));



ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assignments_read_scoped" ON "public"."assignments" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."assignment_targets" "at"
  WHERE (("at"."assignment_id" = "assignments"."id") AND ("at"."student_user_id" = "auth"."uid"()))))));



CREATE POLICY "assignments_write_teacher_admin" ON "public"."assignments" TO "authenticated" USING (("public"."is_admin"() OR ("created_by" = "auth"."uid"()))) WITH CHECK (("public"."is_admin"() OR ("created_by" = "auth"."uid"())));



ALTER TABLE "public"."attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attempts_insert_self_teacher_admin" ON "public"."attempts" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR ("user_id" = "auth"."uid"()) OR ("public"."is_teacher"() AND "public"."can_access_student"("user_id"))));



CREATE POLICY "attempts_read_scoped" ON "public"."attempts" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("user_id" = "auth"."uid"()) OR ("public"."is_teacher"() AND "public"."can_access_student"("user_id"))));



CREATE POLICY "attempts_update_admin_only" ON "public"."attempts" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."bookmarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookmarks_self_all" ON "public"."bookmarks" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."generated_question_sets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "generated_question_sets_select_student_sp" ON "public"."generated_question_sets" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."school_question_sets" "sqs"
  WHERE (("sqs"."set_id" = "generated_question_sets"."id") AND "public"."student_is_member_of_school"("sqs"."school_id")))));



CREATE POLICY "generated_question_sets_select_via_school" ON "public"."generated_question_sets" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."school_question_sets" "sqs"
  WHERE (("sqs"."set_id" = "generated_question_sets"."id") AND "public"."can_manage_school_question_sets_for_school"("sqs"."school_id")))));



ALTER TABLE "public"."generated_questions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "generated_questions_select_student_sp" ON "public"."generated_questions" FOR SELECT TO "authenticated" USING ((("include_in_self_practice" = true) AND (EXISTS ( SELECT 1
   FROM "public"."school_question_sets" "sqs"
  WHERE (("sqs"."set_id" = "generated_questions"."set_id") AND "public"."student_is_member_of_school"("sqs"."school_id"))))));



CREATE POLICY "generated_questions_select_via_school_teacher" ON "public"."generated_questions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."school_question_sets" "sqs"
  WHERE (("sqs"."set_id" = "generated_questions"."set_id") AND "public"."can_manage_school_question_sets_for_school"("sqs"."school_id")))));



CREATE POLICY "generated_questions_self_all" ON "public"."generated_questions" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "generated_sets_self_all" ON "public"."generated_question_sets" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_read_self_teacher_admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_admin"() OR ("public"."is_teacher"() AND (EXISTS ( SELECT 1
   FROM (("public"."school_members" "sm"
     JOIN "public"."schools" "s" ON (("s"."id" = "sm"."school_id")))
     LEFT JOIN "public"."school_teachers" "st" ON (("st"."school_id" = "s"."id")))
  WHERE (("sm"."student_user_id" = "profiles"."id") AND (("s"."teacher_user_id" = "auth"."uid"()) OR ("st"."teacher_user_id" = "auth"."uid"()))))))));



CREATE POLICY "profiles_update_self_or_admin" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_admin"())) WITH CHECK ((("id" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."school_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_members_read_scoped" ON "public"."school_members" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("student_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."schools" "s"
  WHERE (("s"."id" = "school_members"."school_id") AND ("s"."teacher_user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."school_teachers" "st"
  WHERE (("st"."school_id" = "school_members"."school_id") AND ("st"."teacher_user_id" = "auth"."uid"()))))));



CREATE POLICY "school_members_write_teacher_admin" ON "public"."school_members" TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."schools" "s"
  WHERE (("s"."id" = "school_members"."school_id") AND ("s"."teacher_user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."school_teachers" "st"
  WHERE (("st"."school_id" = "school_members"."school_id") AND ("st"."teacher_user_id" = "auth"."uid"())))))) WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."schools" "s"
  WHERE (("s"."id" = "school_members"."school_id") AND ("s"."teacher_user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."school_teachers" "st"
  WHERE (("st"."school_id" = "school_members"."school_id") AND ("st"."teacher_user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."school_question_sets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_question_sets_delete_teacher_admin" ON "public"."school_question_sets" FOR DELETE TO "authenticated" USING ("public"."can_manage_school_question_sets_for_school"("school_id"));



CREATE POLICY "school_question_sets_select_scoped" ON "public"."school_question_sets" FOR SELECT TO "authenticated" USING ("public"."can_access_school_question_set_row"("school_id"));



CREATE POLICY "school_question_sets_update_teacher_admin" ON "public"."school_question_sets" FOR UPDATE TO "authenticated" USING ("public"."can_manage_school_question_sets_for_school"("school_id")) WITH CHECK ("public"."can_manage_school_question_sets_for_school"("school_id"));



CREATE POLICY "school_question_sets_write_teacher_admin" ON "public"."school_question_sets" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_school_question_sets_for_school"("school_id"));



ALTER TABLE "public"."school_teachers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "school_teachers_delete_teacher_admin" ON "public"."school_teachers" FOR DELETE TO "authenticated" USING ("public"."can_write_school_teachers_for_school"("school_id"));



CREATE POLICY "school_teachers_insert_teacher_admin" ON "public"."school_teachers" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_write_school_teachers_for_school"("school_id"));



CREATE POLICY "school_teachers_read_scoped" ON "public"."school_teachers" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("teacher_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."school_members" "sm"
  WHERE (("sm"."school_id" = "school_teachers"."school_id") AND ("sm"."student_user_id" = "auth"."uid"()))))));



CREATE POLICY "school_teachers_update_teacher_admin" ON "public"."school_teachers" FOR UPDATE TO "authenticated" USING ("public"."can_write_school_teachers_for_school"("school_id")) WITH CHECK ("public"."can_write_school_teachers_for_school"("school_id"));



ALTER TABLE "public"."schools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schools_read_members_teacher_admin" ON "public"."schools" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("teacher_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."school_teachers" "st"
  WHERE (("st"."school_id" = "schools"."id") AND ("st"."teacher_user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."school_members" "sm"
  WHERE (("sm"."school_id" = "schools"."id") AND ("sm"."student_user_id" = "auth"."uid"()))))));



CREATE POLICY "schools_write_teacher_admin" ON "public"."schools" TO "authenticated" USING (("public"."is_admin"() OR ("teacher_user_id" = "auth"."uid"()))) WITH CHECK (("public"."is_admin"() OR ("teacher_user_id" = "auth"."uid"())));



ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_settings_self_all" ON "public"."user_settings" TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"())) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_admin"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































REVOKE ALL ON FUNCTION "public"."can_access_school_question_set_row"("p_school_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_school_question_set_row"("p_school_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_school_question_set_row"("p_school_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_school_question_set_row"("p_school_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_student"("student" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_student"("student" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_student"("student" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_school_question_sets_for_school"("p_school_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_school_question_sets_for_school"("p_school_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_school_question_sets_for_school"("p_school_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_school_question_sets_for_school"("p_school_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_write_school_teachers_for_school"("p_school_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_write_school_teachers_for_school"("p_school_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_write_school_teachers_for_school"("p_school_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_write_school_teachers_for_school"("p_school_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_auth_user_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_auth_user_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_auth_user_created"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_teacher"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_teacher"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_teacher"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_app_role"("raw_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_app_role"("raw_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_app_role"("raw_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."student_is_member_of_school"("p_school_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."student_is_member_of_school"("p_school_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."student_is_member_of_school"("p_school_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."student_is_member_of_school"("p_school_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."toggle_generated_question_include_sp"("p_set_id" "text", "p_question_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."toggle_generated_question_include_sp"("p_set_id" "text", "p_question_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_generated_question_include_sp"("p_set_id" "text", "p_question_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_generated_question_include_sp"("p_set_id" "text", "p_question_id" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."assignment_question_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."assignment_question_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_question_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_targets" TO "anon";
GRANT ALL ON TABLE "public"."assignment_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_targets" TO "service_role";



GRANT ALL ON TABLE "public"."assignments" TO "anon";
GRANT ALL ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";



GRANT ALL ON TABLE "public"."attempts" TO "anon";
GRANT ALL ON TABLE "public"."attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."attempts" TO "service_role";



GRANT ALL ON TABLE "public"."bookmarks" TO "anon";
GRANT ALL ON TABLE "public"."bookmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."bookmarks" TO "service_role";



GRANT ALL ON TABLE "public"."generated_question_sets" TO "anon";
GRANT ALL ON TABLE "public"."generated_question_sets" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_question_sets" TO "service_role";



GRANT ALL ON TABLE "public"."generated_questions" TO "anon";
GRANT ALL ON TABLE "public"."generated_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_questions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."school_members" TO "anon";
GRANT ALL ON TABLE "public"."school_members" TO "authenticated";
GRANT ALL ON TABLE "public"."school_members" TO "service_role";



GRANT ALL ON TABLE "public"."school_question_sets" TO "anon";
GRANT ALL ON TABLE "public"."school_question_sets" TO "authenticated";
GRANT ALL ON TABLE "public"."school_question_sets" TO "service_role";



GRANT ALL ON TABLE "public"."school_teachers" TO "anon";
GRANT ALL ON TABLE "public"."school_teachers" TO "authenticated";
GRANT ALL ON TABLE "public"."school_teachers" TO "service_role";



GRANT ALL ON TABLE "public"."schools" TO "anon";
GRANT ALL ON TABLE "public"."schools" TO "authenticated";
GRANT ALL ON TABLE "public"."schools" TO "service_role";



GRANT ALL ON TABLE "public"."teacher_dashboard_standard_metrics" TO "anon";
GRANT ALL ON TABLE "public"."teacher_dashboard_standard_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher_dashboard_standard_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."teacher_dashboard_student_metrics" TO "anon";
GRANT ALL ON TABLE "public"."teacher_dashboard_student_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher_dashboard_student_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

CREATE TRIGGER trg_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_created();


