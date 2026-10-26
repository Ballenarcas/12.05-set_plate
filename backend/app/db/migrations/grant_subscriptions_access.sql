-- The subscriptions table exists in the shared Supabase project but its
-- table privileges were never granted to the backend role. Run this once in
-- the Supabase SQL editor so the FastAPI service can read and write plans.
--
-- Only the service role is granted access: the subscription table should not
-- be readable directly with the public anon key.

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscriptions TO service_role;
