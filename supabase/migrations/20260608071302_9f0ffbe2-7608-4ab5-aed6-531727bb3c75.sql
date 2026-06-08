CREATE TABLE IF NOT EXISTS public.match_guest_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.match_posts(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  host_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  guest_name TEXT,
  guest_phone TEXT NOT NULL,
  guest_note TEXT,
  contact_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.match_guest_contacts TO authenticated;
GRANT ALL ON public.match_guest_contacts TO service_role;

ALTER TABLE public.match_guest_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Host owner or admin can view guest match contacts"
ON public.match_guest_contacts
FOR SELECT
TO authenticated
USING (
  auth.uid() = host_user_id
  OR auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Submitter can view own guest match contacts"
ON public.match_guest_contacts
FOR SELECT
TO authenticated
USING (contact_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_match_guest_contacts_post_created
  ON public.match_guest_contacts(post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_guest_contacts_host_created
  ON public.match_guest_contacts(host_user_id, created_at DESC);

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
  VALUES (
    post_row.host_user_id,
    'New player contact request',
    'A player shared contact details to join your open match.',
    'info'
  );

  IF post_row.owner_id <> post_row.host_user_id THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      post_row.owner_id,
      'New match join contact shared',
      'A player shared contact details for an open match on your court.',
      'info'
    );
  END IF;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_guest_match_contact(UUID, TEXT, TEXT, TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.request_guest_match_contact(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_guest_match_contact(UUID, TEXT, TEXT, TEXT, UUID) TO service_role;