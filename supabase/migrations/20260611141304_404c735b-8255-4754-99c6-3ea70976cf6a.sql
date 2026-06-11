CREATE OR REPLACE FUNCTION public.update_guest_match_contact_status(
  _contact_id UUID,
  _status public.match_guest_contact_status,
  _actor_user_id UUID
)
RETURNS public.match_guest_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contact_row public.match_guest_contacts;
  actor_is_admin BOOLEAN;
  post_row public.match_posts;
  already_joined_as_participant BOOLEAN;
BEGIN
  IF _status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Status must be accepted or rejected';
  END IF;

  IF _actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT public.has_role(_actor_user_id, 'admin') INTO actor_is_admin;

  SELECT *
  INTO contact_row
  FROM public.match_guest_contacts
  WHERE id = _contact_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join request not found';
  END IF;

  IF NOT (
    _actor_user_id = contact_row.host_user_id
    OR _actor_user_id = contact_row.owner_id
    OR actor_is_admin
  ) THEN
    RAISE EXCEPTION 'Not allowed to review this join request';
  END IF;

  IF contact_row.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been reviewed';
  END IF;

  IF _status = 'accepted' THEN
    SELECT *
    INTO post_row
    FROM public.match_posts
    WHERE id = contact_row.post_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Match post not found';
    END IF;

    IF post_row.status IN ('cancelled', 'completed') THEN
      RAISE EXCEPTION 'Match is no longer accepting join requests';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.post_id = contact_row.post_id
        AND mp.user_id = contact_row.contact_user_id
        AND mp.status = 'joined'
    )
    INTO already_joined_as_participant;

    IF NOT COALESCE(already_joined_as_participant, FALSE) THEN
      IF post_row.joined_players >= post_row.needed_players THEN
        RAISE EXCEPTION 'Match is already full';
      END IF;

      UPDATE public.match_posts
      SET
        joined_players = joined_players + 1,
        status = CASE
          WHEN joined_players + 1 >= needed_players THEN 'full'::public.match_post_status
          ELSE 'open'::public.match_post_status
        END,
        updated_at = now()
      WHERE id = post_row.id;
    END IF;
  END IF;

  UPDATE public.match_guest_contacts
  SET
    status = _status,
    decided_at = now(),
    decided_by = _actor_user_id,
    updated_at = now()
  WHERE id = _contact_id
  RETURNING * INTO contact_row;

  IF contact_row.contact_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      contact_row.contact_user_id,
      CASE WHEN _status = 'accepted' THEN 'Join request accepted' ELSE 'Join request rejected' END,
      CASE WHEN _status = 'accepted'
           THEN 'Your join request was accepted. The host or court team may contact you shortly.'
           ELSE 'Your join request was rejected for this match.'
      END,
      CASE WHEN _status = 'accepted' THEN 'success' ELSE 'info' END
    );
  END IF;

  RETURN contact_row;
END;
$$;

WITH participant_counts AS (
  SELECT mp.post_id, COUNT(*)::INT AS joined_count
  FROM public.match_participants mp
  WHERE mp.status = 'joined'
  GROUP BY mp.post_id
),
accepted_guest_counts AS (
  SELECT mgc.post_id, COUNT(*)::INT AS accepted_count
  FROM public.match_guest_contacts mgc
  WHERE mgc.status = 'accepted'
    AND NOT EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.post_id = mgc.post_id
        AND mp.user_id = mgc.contact_user_id
        AND mp.status = 'joined'
    )
  GROUP BY mgc.post_id
),
recalculated AS (
  SELECT
    mp.id AS post_id,
    LEAST(
      mp.needed_players,
      COALESCE(pc.joined_count, 0) + COALESCE(agc.accepted_count, 0)
    )::INT AS recalculated_joined
  FROM public.match_posts mp
  LEFT JOIN participant_counts pc ON pc.post_id = mp.id
  LEFT JOIN accepted_guest_counts agc ON agc.post_id = mp.id
)
UPDATE public.match_posts mp
SET
  joined_players = r.recalculated_joined,
  status = CASE
    WHEN r.recalculated_joined >= mp.needed_players THEN 'full'::public.match_post_status
    ELSE 'open'::public.match_post_status
  END,
  updated_at = now()
FROM recalculated r
WHERE mp.id = r.post_id
  AND mp.status IN ('open', 'full')
  AND (
    mp.joined_players IS DISTINCT FROM r.recalculated_joined
    OR mp.status IS DISTINCT FROM CASE
      WHEN r.recalculated_joined >= mp.needed_players THEN 'full'::public.match_post_status
      ELSE 'open'::public.match_post_status
    END
  );