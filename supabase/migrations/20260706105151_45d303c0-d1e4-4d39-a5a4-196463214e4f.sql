DROP POLICY IF EXISTS "Anyone can view slot locks" ON public.slot_locks;
CREATE POLICY "Authenticated users can view slot locks"
ON public.slot_locks
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Anyone can view pricing rules" ON public.pricing_rules;
CREATE POLICY "Owners and admins can view pricing rules"
ON public.pricing_rules
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.courts c
    WHERE c.id = pricing_rules.court_id
      AND c.owner_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
CREATE POLICY "Owners, reviewers, and admins can view reviews"
ON public.reviews
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.courts c
    WHERE c.id = reviews.court_id
      AND c.owner_id = auth.uid()
  )
);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.match_action_events FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'whatsapp_sessions' AND policyname = 'No direct reads on whatsapp sessions'
  ) THEN
    CREATE POLICY "No direct reads on whatsapp sessions"
    ON public.whatsapp_sessions
    FOR SELECT
    TO anon, authenticated
    USING (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'whatsapp_sessions' AND policyname = 'No direct inserts on whatsapp sessions'
  ) THEN
    CREATE POLICY "No direct inserts on whatsapp sessions"
    ON public.whatsapp_sessions
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'whatsapp_sessions' AND policyname = 'No direct updates on whatsapp sessions'
  ) THEN
    CREATE POLICY "No direct updates on whatsapp sessions"
    ON public.whatsapp_sessions
    FOR UPDATE
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'whatsapp_sessions' AND policyname = 'No direct deletes on whatsapp sessions'
  ) THEN
    CREATE POLICY "No direct deletes on whatsapp sessions"
    ON public.whatsapp_sessions
    FOR DELETE
    TO anon, authenticated
    USING (false);
  END IF;
END
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
REVOKE SELECT ON ALL TABLES IN SCHEMA graphql FROM anon, authenticated;