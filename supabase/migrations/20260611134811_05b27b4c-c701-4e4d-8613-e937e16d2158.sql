CREATE POLICY "Hosts and owners can view joined player profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.match_participants mp
    JOIN public.match_posts post ON post.id = mp.post_id
    WHERE mp.user_id = profiles.id
      AND mp.status = 'joined'::public.match_participant_status
      AND (
        post.host_user_id = auth.uid()
        OR post.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
  )
);