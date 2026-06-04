DROP POLICY IF EXISTS "Authenticated users can upload own booking payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Booking participants can view payment screenshots" ON storage.objects;

CREATE POLICY "Authenticated users can upload own booking payment screenshots"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-screenshots'
  AND (storage.foldername(storage.objects.name))[1] = 'bookings'
  AND (storage.foldername(storage.objects.name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.courts court_row ON court_row.id = b.court_id
    WHERE b.id::text = (storage.foldername(storage.objects.name))[2]
      AND (
        b.user_id = auth.uid()
        OR court_row.owner_id = auth.uid()
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
  AND (storage.foldername(storage.objects.name))[1] = 'bookings'
  AND (storage.foldername(storage.objects.name))[2] IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.courts court_row ON court_row.id = b.court_id
    WHERE b.id::text = (storage.foldername(storage.objects.name))[2]
      AND (
        b.user_id = auth.uid()
        OR court_row.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  )
);

CREATE OR REPLACE VIEW public.owner_customer_contacts AS
SELECT DISTINCT
  c.owner_id,
  p.id AS customer_id,
  p.full_name,
  p.email
FROM public.bookings b
JOIN public.courts c ON c.id = b.court_id
JOIN public.profiles p ON p.id = b.user_id;
ALTER VIEW public.owner_customer_contacts SET (security_invoker = true);
GRANT SELECT ON public.owner_customer_contacts TO authenticated;