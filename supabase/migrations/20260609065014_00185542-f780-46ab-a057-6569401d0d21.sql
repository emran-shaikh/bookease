CREATE OR REPLACE FUNCTION public.request_guest_match_contact(
  _post_id UUID,
  _guest_name TEXT,
  _guest_phone TEXT,
  _guest_note TEXT DEFAULT NULL,
  _contact_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_row RECORD;
  normalized_phone TEXT;
  new_id UUID;
BEGIN
  normalized_phone := regexp_replace(COALESCE(_guest_phone, ''), '[^0-9+]', '', 'g');

  IF length(replace(normalized_phone, '+', '')) < 10 OR length(replace(normalized_phone, '+', '')) > 15 THEN
    RAISE EXCEPTION 'Please provide a valid contact number';
  END IF;

  SELECT id, booking_id, host_user_id, owner_id, status, match_date, start_time
  INTO post_row
  FROM public.match_posts
  WHERE id = _post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match post not found';
  END IF;

  IF post_row.status <> 'open' THEN
    RAISE EXCEPTION 'This match is no longer open';
  END IF;

  IF post_row.match_date < current_date
     OR (post_row.match_date = current_date AND post_row.start_time <= localtime) THEN
    RAISE EXCEPTION 'This match has already started';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_guest_contacts mgc
    WHERE mgc.post_id = _post_id
      AND mgc.guest_phone = normalized_phone
      AND mgc.created_at >= now() - interval '12 hours'
  ) THEN
    RAISE EXCEPTION 'This contact number was already shared recently for this match';
  END IF;

  INSERT INTO public.match_guest_contacts (
    post_id,
    booking_id,
    host_user_id,
    owner_id,
    guest_name,
    guest_phone,
    guest_note,
    contact_user_id
  )
  VALUES (
    post_row.id,
    post_row.booking_id,
    post_row.host_user_id,
    post_row.owner_id,
    NULLIF(trim(_guest_name), ''),
    normalized_phone,
    NULLIF(trim(_guest_note), ''),
    _contact_user_id
  )
  RETURNING id INTO new_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  SELECT recipient.user_id, recipient.title, recipient.message, 'info'
  FROM (
    SELECT DISTINCT r.user_id, r.title, r.message
    FROM (
      SELECT post_row.host_user_id AS user_id,
             'New player contact request'::TEXT AS title,
             'A player shared contact details to join your open match.'::TEXT AS message

      UNION ALL

      SELECT post_row.owner_id AS user_id,
             'New match join contact shared'::TEXT AS title,
             'A player shared contact details for an open match on your court.'::TEXT AS message
      WHERE post_row.owner_id <> post_row.host_user_id

      UNION ALL

      SELECT ur.user_id,
             'Guest join request submitted'::TEXT AS title,
             'A guest submitted contact details for an open match.'::TEXT AS message
      FROM public.user_roles ur
      WHERE ur.role = 'admin'::public.app_role

      UNION ALL

      SELECT _contact_user_id,
             'Request shared successfully'::TEXT AS title,
             'Your contact details were shared with the host and court team.'::TEXT AS message
      WHERE _contact_user_id IS NOT NULL
    ) r
    WHERE r.user_id IS NOT NULL
  ) AS recipient;

  RETURN new_id;
END;
$$;