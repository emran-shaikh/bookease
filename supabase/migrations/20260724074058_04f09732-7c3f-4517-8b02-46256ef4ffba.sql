DROP POLICY IF EXISTS "Hosts and owners can view joined player profiles" ON public.profiles;

ALTER FUNCTION public.has_role(uuid, public.app_role)
SECURITY INVOKER;

GRANT SELECT ON public.user_roles TO anon;

REVOKE EXECUTE ON FUNCTION public.close_expired_match_posts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_expired_match_posts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.close_expired_match_posts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.close_expired_match_posts() TO service_role;