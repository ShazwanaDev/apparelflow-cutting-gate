-- Hosted Postgres platforms such as Supabase publish every table in the public
-- schema through an automatic REST API, reachable by the platform's "anon" and
-- "authenticated" roles. This application never uses that API: all access goes
-- through its own server, which enforces roles, the hard stop and the audit
-- rules. Left open, the API would be a second door around all of that, able to
-- read password hashes or set an order's status directly.
--
-- So every table gets row-level security switched on with no policies, which
-- denies those roles every row, and their privileges are revoked as well. The
-- application connects as the tables' owner, which row-level security does not
-- restrict, so it is unaffected.
--
-- On a plain Postgres (local development, the tests) the API roles do not exist
-- and the revokes are skipped; enabling row-level security is harmless there.

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT unnest(ARRAY['users', 'recipes', 'recipe_components', 'cutting_orders', 'verification_items', 'verification_logs', 'order_events', 'schema_migrations'])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
  END IF;
END
$$;
