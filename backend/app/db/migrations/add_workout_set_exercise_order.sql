-- Keeps the order exercises were trained in. Run this BEFORE deploying the backend that writes it.
ALTER TABLE public.workout_sets
    ADD COLUMN IF NOT EXISTS exercise_order integer;

-- Existing rows were inserted exercise by exercise, so their storage order is the training order.
WITH first_seen AS (
    SELECT workout_id, exercise_id, min(ctid) AS first_row
    FROM public.workout_sets
    GROUP BY workout_id, exercise_id
), ranked AS (
    SELECT workout_id, exercise_id,
           row_number() OVER (PARTITION BY workout_id ORDER BY first_row) - 1 AS position
    FROM first_seen
)
UPDATE public.workout_sets AS sets
SET exercise_order = ranked.position
FROM ranked
WHERE sets.workout_id = ranked.workout_id
  AND sets.exercise_id = ranked.exercise_id
  AND sets.exercise_order IS NULL;
