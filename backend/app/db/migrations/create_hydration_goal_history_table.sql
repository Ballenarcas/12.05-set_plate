-- Keep the goal that was active on each day, so changing the goal today
-- never rewrites past weeks.
--
-- This script is additive only: it creates one new table and its indexes.
-- It does not alter, delete, or rewrite any existing table or row.
-- Run once in the Supabase SQL editor. Re-running is safe.

CREATE TABLE IF NOT EXISTS public.hydration_goal_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    effective_date DATE NOT NULL,
    goal_ml INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS hydration_goal_history_user_day_idx
    ON public.hydration_goal_history (user_id, effective_date);

CREATE INDEX IF NOT EXISTS hydration_goal_history_user_date_idx
    ON public.hydration_goal_history (user_id, effective_date DESC);

-- The table starts empty. The first goal change writes a baseline for older
-- days, then the new goal from that day forward.
