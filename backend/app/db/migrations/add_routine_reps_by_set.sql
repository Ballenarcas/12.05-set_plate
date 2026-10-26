ALTER TABLE public.routine_exercises
ADD COLUMN IF NOT EXISTS reps_by_set integer[];

UPDATE public.routine_exercises
SET reps_by_set = array_fill(
    COALESCE(target_reps, 10),
    ARRAY[GREATEST(COALESCE(target_sets, 1), 1)]
)
WHERE reps_by_set IS NULL;

ALTER TABLE public.routine_exercises
ALTER COLUMN reps_by_set SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'routine_exercises_reps_by_set_count'
          AND conrelid = 'public.routine_exercises'::regclass
    ) THEN
        ALTER TABLE public.routine_exercises
        ADD CONSTRAINT routine_exercises_reps_by_set_count
        CHECK (cardinality(reps_by_set) = target_sets);
    END IF;
END $$;
