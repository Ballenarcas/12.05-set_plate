-- Daily hydration: one row per drink a user logs, summed for each user's day.
-- Run once in the Supabase SQL editor. Re-running is safe.

CREATE TABLE IF NOT EXISTS public.hydration_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    amount_ml INTEGER NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 5000),
    source TEXT NOT NULL DEFAULT 'ml' CHECK (source IN ('ml', 'glass')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hydration_logs_user_date_idx ON public.hydration_logs (user_id, log_date);

ALTER TABLE public.hydration_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hydration_logs_service_role" ON public.hydration_logs;
CREATE POLICY "hydration_logs_service_role" ON public.hydration_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The backend owns this table; anon and authenticated never touch Supabase directly.
REVOKE ALL ON public.hydration_logs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hydration_logs TO service_role;

-- Verify afterwards:
--   SELECT tablename, policyname, roles FROM pg_policies WHERE tablename = 'hydration_logs';
