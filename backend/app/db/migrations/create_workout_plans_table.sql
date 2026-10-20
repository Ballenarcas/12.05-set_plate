-- AI and routine training plans for a single day, kept apart from completed workouts.

CREATE TABLE IF NOT EXISTS public.workout_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    plan_date DATE NOT NULL,
    routine_id UUID,
    title TEXT NOT NULL,
    exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_rest_day BOOLEAN NOT NULL DEFAULT FALSE,
    ai_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
    ai_reasoning TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT workout_plans_user_date_key UNIQUE (user_id, plan_date)
);

ALTER TABLE public.workout_plans ADD COLUMN IF NOT EXISTS is_rest_day BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role full access to workout plans" ON public.workout_plans;

CREATE POLICY "Allow service role full access to workout plans"
    ON public.workout_plans
    FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');
