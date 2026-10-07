CREATE OR REPLACE FUNCTION public.get_hosted_match_participants(_post_ids uuid[])
RETURNS TABLE (id uuid, post_id uuid, status match_participant_status, joined_at timestamptz, full_name text, phone text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT mp.id, mp.post_id, mp.status, mp.joined_at, p.full_name, p.phone, p.email
  FROM public.match_participants mp
  JOIN public.match_posts po ON po.id = mp.post_id
  LEFT JOIN public.profiles p ON p.id = mp.user_id
  WHERE mp.post_id = ANY(_post_ids)
    AND auth.uid() IS NOT NULL
    AND (po.host_user_id = auth.uid() OR po.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ORDER BY mp.joined_at;
$$;
REVOKE EXECUTE ON FUNCTION public.get_hosted_match_participants(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hosted_match_participants(uuid[]) TO authenticated;