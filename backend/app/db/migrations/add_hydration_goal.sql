-- Persist a custom daily hydration goal per user.
-- NULL means the app's weight-based recommended goal.
-- Run once in the Supabase SQL editor. Re-running is safe.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS hydration_goal_ml INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_hydration_goal_range'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_hydration_goal_range
            CHECK (hydration_goal_ml IS NULL OR (hydration_goal_ml BETWEEN 500 AND 10000));
    END IF;
END $$;

-- Verify afterwards:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'users' AND column_name = 'hydration_goal_ml';
