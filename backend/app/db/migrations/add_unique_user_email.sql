-- Registration now rejects an email that already exists instead of upserting
-- over it. That check is only race-free with a unique index behind it.
--
-- Run once in the Supabase SQL editor. If duplicate addresses already exist,
-- delete or merge them first; the index creation will fail otherwise.

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
    ON public.users (lower(email));
