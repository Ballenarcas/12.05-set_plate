-- Health Connect consent and the daily step/active-calorie aggregates read from it.
-- The frontend syncs days from the Android Health Connect bridge; the AI trainer
-- reads the stored aggregates when it builds calorie and training suggestions.

CREATE TABLE IF NOT EXISTS public.health_connections (
    user_id UUID PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'health_connect',
    connected BOOLEAN NOT NULL DEFAULT TRUE,
    source TEXT NOT NULL DEFAULT 'health_connect',
    scopes JSONB NOT NULL DEFAULT '{"steps": true, "active_calories": true}'::jsonb,
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.health_activity (
    user_id UUID NOT NULL,
    activity_date DATE NOT NULL,
    steps INTEGER NOT NULL DEFAULT 0,
    active_calories INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'health_connect',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, activity_date),
    CONSTRAINT health_activity_steps_non_negative CHECK (steps >= 0),
    CONSTRAINT health_activity_calories_non_negative CHECK (active_calories >= 0)
);

ALTER TABLE public.health_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_activity ENABLE ROW LEVEL SECURITY;

-- Health data is never exposed through the public Supabase API. The SPA talks
-- to FastAPI, and FastAPI reads these tables with the service-role key.
REVOKE ALL ON public.health_connections FROM anon, authenticated;
REVOKE ALL ON public.health_activity FROM anon, authenticated;

DROP POLICY IF EXISTS "Allow service role full access to health connections" ON public.health_connections;
CREATE POLICY "Allow service role full access to health connections"
    ON public.health_connections
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role full access to health activity" ON public.health_activity;
CREATE POLICY "Allow service role full access to health activity"
    ON public.health_activity
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_activity TO service_role;
