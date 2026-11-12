-- Indexes for the foreign keys Supabase's performance advisor flags as unindexed.
-- Meals, the dashboard, AI tips and workout planning filter meals by user and time;
-- Workouts and planning read routines by user and their exercises by routine; the
-- rest back joins and keep deletes on the parent tables from scanning the child table.
--
-- Run once in the Supabase SQL editor. Safe to re-run; no data changes.

CREATE INDEX IF NOT EXISTS meals_user_consumed_idx ON public.meals (user_id, consumed_at);
CREATE INDEX IF NOT EXISTS meals_food_idx ON public.meals (food_id);
CREATE INDEX IF NOT EXISTS routines_user_idx ON public.routines (user_id);
CREATE INDEX IF NOT EXISTS routine_exercises_routine_idx ON public.routine_exercises (routine_id);
CREATE INDEX IF NOT EXISTS routine_exercises_exercise_idx ON public.routine_exercises (exercise_id);
CREATE INDEX IF NOT EXISTS workout_sets_exercise_idx ON public.workout_sets (exercise_id);
CREATE INDEX IF NOT EXISTS workouts_routine_idx ON public.workouts (routine_id);
