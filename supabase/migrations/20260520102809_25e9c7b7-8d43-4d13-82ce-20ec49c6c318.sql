-- Remove broad profile exposure policy that leaked payment/contact details
DROP POLICY IF EXISTS "Anyone can view owner payment details" ON public.profiles;

-- Remove broad blocked-slot read policy that exposed guest contact info
DROP POLICY IF EXISTS "Anyone can view blocked slots" ON public.blocked_slots;

-- Provide a safe public projection for availability checks (no guest PII)
CREATE OR REPLACE VIEW public.blocked_slots_public AS
SELECT
  id,
  court_id,
  date,
  start_time,
  end_time,
  reason,
  created_at
FROM public.blocked_slots;

GRANT SELECT ON public.blocked_slots_public TO anon, authenticated;