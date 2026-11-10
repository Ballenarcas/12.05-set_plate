-- Statistics, history and the dashboard filter workouts by user and date, and load each
-- workout's sets. Without these indexes Postgres reads both tables in full for every request.
--
-- Run once in the Supabase SQL editor. Safe to re-run; no data changes.

CREATE INDEX IF NOT EXISTS workouts_user_start_idx ON public.workouts (user_id, start_time);
CREATE INDEX IF NOT EXISTS workout_sets_workout_idx ON public.workout_sets (workout_id);
