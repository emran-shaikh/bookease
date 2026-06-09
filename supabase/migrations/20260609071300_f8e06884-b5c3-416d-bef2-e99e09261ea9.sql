DO $$ BEGIN
  CREATE TYPE public.match_guest_contact_status AS ENUM ('pending', 'accepted', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.match_guest_contacts
ADD COLUMN IF NOT EXISTS status public.match_guest_contact_status NOT NULL DEFAULT 'pending';

ALTER TABLE public.match_guest_contacts
ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

ALTER TABLE public.match_guest_contacts
ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_match_guest_contacts_status_created
  ON public.match_guest_contacts(status, created_at DESC);

CREATE POLICY "Host owner or admin can update guest match contacts"
ON public.match_guest_contacts
FOR UPDATE
TO authenticated
USING (
  auth.uid() = host_user_id
  OR auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  auth.uid() = host_user_id
  OR auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin')
);

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

GRANT EXECUTE ON FUNCTION public.update_guest_match_contact_status(UUID, public.match_guest_contact_status, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_guest_match_contact_status(UUID, public.match_guest_contact_status, UUID) TO service_role;