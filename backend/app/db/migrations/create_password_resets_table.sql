-- One-time password reset links. Only the sha256 of each token is stored, so a
-- database leak cannot be turned into working reset links.
--
-- Run once in the Supabase SQL editor. The backend reads and writes this table
-- with the service-role key; RLS with no policies keeps it closed to anon users.

CREATE TABLE IF NOT EXISTS public.password_resets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_resets_user_idx ON public.password_resets (user_id);

ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
