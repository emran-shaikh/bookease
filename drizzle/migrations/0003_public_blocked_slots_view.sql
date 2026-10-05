-- View exposes only non-personal columns; must bypass base-table RLS so customers can see blocked times
ALTER VIEW public.blocked_slots_public SET (security_invoker = false);
GRANT SELECT ON public.blocked_slots_public TO anon, authenticated;