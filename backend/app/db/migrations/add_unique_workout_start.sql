-- A workout session keeps its start time, so the same user and start time means the same workout.
-- This stops two parallel saves of one workout. Run once; running it again changes nothing.

CREATE UNIQUE INDEX IF NOT EXISTS workouts_user_start_time_key ON public.workouts (user_id, start_time);
