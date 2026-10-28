-- Harden Row Level Security for the tables the FastAPI service owns.
--
-- The seed script created policies such as:
--   CREATE POLICY "Allow public all users" ON public.users FOR ALL USING (true);
-- which let the public `anon` role read (including password hashes), write and
-- delete every row. The backend authenticates users itself and talks to
-- Supabase with the service-role key, so anon/authenticated need nothing.
--
-- Run once in the Supabase SQL editor. Re-running is safe.

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'users',
    'meals',
    'meal_ingredients',
    'routines',
    'routine_exercises',
    'workouts',
    'workout_sets',
    'subscriptions',
    'workout_plans',
    'ai_calorie_adjustments'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', target);

    EXECUTE format('DROP POLICY IF EXISTS "Allow public all %s" ON public.%I;', target, target);
    EXECUTE format('DROP POLICY IF EXISTS "Users can access meal ingredients" ON public.%I;', target);
    EXECUTE format('DROP POLICY IF EXISTS "Allow service role full access to workout plans" ON public.%I;', target);

    EXECUTE format('DROP POLICY IF EXISTS "%s_service_role" ON public.%I;', target, target);
    EXECUTE format(
      'CREATE POLICY "%s_service_role" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
      target,
      target
    );
  END LOOP;
END $$;

-- Table privileges: anon/authenticated keep no access at all.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- Table privileges: anon/authenticated keep no access at all. The SPA never
-- talks to Supabase directly; it goes through the FastAPI service, which uses
-- the service-role key. The exercise catalogue is therefore still public, but
-- only through /api/v1/workouts/exercises.

-- Verify afterwards:
--   SELECT tablename, policyname, roles, cmd, qual
--   FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
