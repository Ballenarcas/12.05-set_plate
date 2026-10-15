ALTER TABLE public.workouts
    ADD COLUMN IF NOT EXISTS ai_adjusted boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS ai_reasoning text;
