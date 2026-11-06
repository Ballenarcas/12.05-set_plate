-- Rule-based Home tips. One row per tip shown to a user on a given day.
-- Run once in the Supabase SQL editor. Re-running is safe.

CREATE TABLE IF NOT EXISTS public.ai_tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tip_date DATE NOT NULL,
    kind TEXT NOT NULL,
    state_key TEXT NOT NULL,
    message TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    action JSONB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    source TEXT NOT NULL DEFAULT 'template' CHECK (source IN ('template', 'model')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_tips_user_day_kind_state_key UNIQUE (user_id, tip_date, kind, state_key)
);

CREATE INDEX IF NOT EXISTS ai_tips_user_date_idx ON public.ai_tips (user_id, tip_date);

ALTER TABLE public.ai_tips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_tips_service_role" ON public.ai_tips;
CREATE POLICY "ai_tips_service_role" ON public.ai_tips FOR ALL TO service_role USING (true) WITH CHECK (true);
