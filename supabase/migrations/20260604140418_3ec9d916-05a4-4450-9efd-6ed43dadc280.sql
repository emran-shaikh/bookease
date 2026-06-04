CREATE TABLE IF NOT EXISTS public.owner_payment_settings (
  owner_id uuid PRIMARY KEY,
  bank_name text,
  account_title text,
  account_number text,
  whatsapp_number text,
  n8n_webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_payment_settings TO authenticated;
GRANT ALL ON public.owner_payment_settings TO service_role;
ALTER TABLE public.owner_payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage own payment settings" ON public.owner_payment_settings;
CREATE POLICY "Owners can manage own payment settings"
ON public.owner_payment_settings
FOR ALL
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Admins can manage all payment settings" ON public.owner_payment_settings;
CREATE POLICY "Admins can manage all payment settings"
ON public.owner_payment_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_owner_payment_settings_updated_at ON public.owner_payment_settings;
CREATE TRIGGER update_owner_payment_settings_updated_at
BEFORE UPDATE ON public.owner_payment_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.owner_payment_settings (owner_id, bank_name, account_title, account_number, whatsapp_number, n8n_webhook_url)
SELECT id, bank_name, account_title, account_number, whatsapp_number, n8n_webhook_url
FROM public.profiles
WHERE bank_name IS NOT NULL OR account_title IS NOT NULL OR account_number IS NOT NULL OR whatsapp_number IS NOT NULL OR n8n_webhook_url IS NOT NULL
ON CONFLICT (owner_id) DO UPDATE
SET bank_name = EXCLUDED.bank_name,
    account_title = EXCLUDED.account_title,
    account_number = EXCLUDED.account_number,
    whatsapp_number = EXCLUDED.whatsapp_number,
    n8n_webhook_url = EXCLUDED.n8n_webhook_url,
    updated_at = now();

CREATE OR REPLACE VIEW public.owner_payment_public AS
SELECT
  owner_id,
  bank_name,
  account_title,
  account_number,
  whatsapp_number
FROM public.owner_payment_settings;
ALTER VIEW public.owner_payment_public SET (security_invoker = true);
GRANT SELECT ON public.owner_payment_public TO authenticated;

DROP POLICY IF EXISTS "Court owners can view customer profiles for their bookings" ON public.profiles;

DROP POLICY IF EXISTS "Blocked slot owners and admins can view blocked slots" ON public.blocked_slots;
CREATE POLICY "Blocked slot owners and admins can view blocked slots"
ON public.blocked_slots
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.courts
    WHERE courts.id = blocked_slots.court_id
      AND (courts.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

DROP POLICY IF EXISTS "Service role full access" ON public.whatsapp_sessions;

DROP POLICY IF EXISTS "Anyone can view payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload payment screenshots" ON storage.objects;
CREATE POLICY "Authenticated users can upload own booking payment screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-screenshots'
  AND (storage.foldername(name))[1] = 'bookings'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.courts c ON c.id = b.court_id
    WHERE b.id::text = (storage.foldername(name))[2]
      AND (
        b.user_id = auth.uid()
        OR c.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  )
);

CREATE POLICY "Booking participants can view payment screenshots"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-screenshots'
  AND (storage.foldername(name))[1] = 'bookings'
  AND (storage.foldername(name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.courts c ON c.id = b.court_id
    WHERE b.id::text = (storage.foldername(name))[2]
      AND (
        b.user_id = auth.uid()
        OR c.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  )
);

DROP POLICY IF EXISTS "Authenticated users can upload review images" ON storage.objects;
CREATE POLICY "Authenticated users can upload review images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'review-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Anyone can view review images" ON storage.objects;

CREATE POLICY "Authenticated users can listen to authorized realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'postgres_changes'
  AND (
    split_part(topic, '-', 1) = 'slot_locks_changes'
    OR (
      split_part(topic, '-', 1) = 'notifications'
      AND split_part(topic, '-', 2) = auth.uid()::text
    )
    OR (
      split_part(topic, '-', 1) = 'favorites'
      AND split_part(topic, '-', 2) = auth.uid()::text
    )
    OR (
      split_part(topic, '-', 1) = 'court-bookings'
      AND EXISTS (
        SELECT 1
        FROM public.courts c
        WHERE c.id::text = split_part(topic, '-', 2)
          AND c.owner_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Authenticated users can send authorized realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  extension = 'postgres_changes'
  AND (
    split_part(topic, '-', 1) = 'slot_locks_changes'
    OR (
      split_part(topic, '-', 1) = 'notifications'
      AND split_part(topic, '-', 2) = auth.uid()::text
    )
    OR (
      split_part(topic, '-', 1) = 'favorites'
      AND split_part(topic, '-', 2) = auth.uid()::text
    )
    OR (
      split_part(topic, '-', 1) = 'court-bookings'
      AND EXISTS (
        SELECT 1
        FROM public.courts c
        WHERE c.id::text = split_part(topic, '-', 2)
          AND c.owner_id = auth.uid()
      )
    )
  )
);

REVOKE EXECUTE ON FUNCTION public.assign_test_account_roles() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_booking_overlap() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_court_status_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_venue_status_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_booking_source_metadata() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_court_slug() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_venue_slug() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_slot_locks() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_court_booking_count(uuid) FROM anon, authenticated;

CREATE OR REPLACE VIEW public.blocked_slots_public WITH (security_invoker = true) AS
SELECT
  id,
  court_id,
  date,
  start_time,
  end_time,
  reason,
  created_at
FROM public.blocked_slots;