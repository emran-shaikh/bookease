DO $$ BEGIN
  CREATE TYPE public.match_post_status AS ENUM ('open', 'full', 'cancelled', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.match_participant_status AS ENUM ('joined', 'cancelled', 'attended', 'no_show');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.match_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  host_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  sport_type TEXT NOT NULL,
  city TEXT,
  match_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  needed_players INTEGER NOT NULL CHECK (needed_players >= 1 AND needed_players <= 20),
  joined_players INTEGER NOT NULL DEFAULT 0 CHECK (joined_players >= 0),
  status public.match_post_status NOT NULL DEFAULT 'open',
  skill_level TEXT,
  notes TEXT,
  host_display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.match_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_posts TO authenticated;
GRANT ALL ON public.match_posts TO service_role;

ALTER TABLE public.match_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active match posts"
ON public.match_posts
FOR SELECT
TO public
USING (
  status IN ('open', 'full')
  OR auth.uid() = host_user_id
  OR auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Hosts can create match posts"
ON public.match_posts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = host_user_id);

CREATE POLICY "Hosts or owners can update match posts"
ON public.match_posts
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

CREATE POLICY "Hosts or owners can delete match posts"
ON public.match_posts
FOR DELETE
TO authenticated
USING (
  auth.uid() = host_user_id
  OR auth.uid() = owner_id
  OR public.has_role(auth.uid(), 'admin')
);

CREATE TABLE IF NOT EXISTS public.match_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.match_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.match_participant_status NOT NULL DEFAULT 'joined',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_participants TO authenticated;
GRANT ALL ON public.match_participants TO service_role;

ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants and hosts can view participants"
ON public.match_participants
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.match_posts mp
    WHERE mp.id = match_participants.post_id
      AND (
        mp.host_user_id = auth.uid()
        OR mp.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  )
);

CREATE POLICY "Users can join as themselves"
ON public.match_participants
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own participation"
ON public.match_participants
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can remove own participation"
ON public.match_participants
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.player_reliability (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 100,
  joined_count INTEGER NOT NULL DEFAULT 0,
  attended_count INTEGER NOT NULL DEFAULT 0,
  no_show_count INTEGER NOT NULL DEFAULT 0,
  late_cancel_count INTEGER NOT NULL DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.player_reliability TO authenticated;
GRANT ALL ON public.player_reliability TO service_role;

ALTER TABLE public.player_reliability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reliability"
ON public.player_reliability
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update own reliability"
ON public.player_reliability
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create own reliability"
ON public.player_reliability
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_match_posts_discovery ON public.match_posts(status, match_date, start_time, city, sport_type);
CREATE INDEX IF NOT EXISTS idx_match_posts_booking ON public.match_posts(booking_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_post ON public.match_participants(post_id, status);
CREATE INDEX IF NOT EXISTS idx_match_participants_user ON public.match_participants(user_id, status);

CREATE OR REPLACE FUNCTION public.create_match_post_from_booking(
  _booking_id UUID,
  _host_user_id UUID,
  _needed_players INTEGER,
  _skill_level TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS public.match_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_row RECORD;
  result_row public.match_posts;
BEGIN
  IF _needed_players < 1 OR _needed_players > 20 THEN
    RAISE EXCEPTION 'Needed players must be between 1 and 20';
  END IF;

  SELECT
    b.id,
    b.user_id,
    b.court_id,
    b.booking_date,
    b.start_time,
    b.end_time,
    b.status AS booking_status,
    c.owner_id,
    c.venue_id,
    c.sport_type,
    c.city,
    p.full_name AS host_display_name
  INTO booking_row
  FROM public.bookings b
  JOIN public.courts c ON c.id = b.court_id
  LEFT JOIN public.profiles p ON p.id = b.user_id
  WHERE b.id = _booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF booking_row.user_id <> _host_user_id THEN
    RAISE EXCEPTION 'Only the booking owner can open a match post';
  END IF;

  IF booking_row.booking_status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Only pending/confirmed bookings can open a match post';
  END IF;

  IF booking_row.booking_date < current_date
     OR (booking_row.booking_date = current_date AND booking_row.start_time <= localtime) THEN
    RAISE EXCEPTION 'Cannot open a match for a past or started booking';
  END IF;

  INSERT INTO public.match_posts (
    booking_id,
    host_user_id,
    owner_id,
    court_id,
    venue_id,
    sport_type,
    city,
    match_date,
    start_time,
    end_time,
    needed_players,
    joined_players,
    status,
    skill_level,
    notes,
    host_display_name
  )
  VALUES (
    booking_row.id,
    booking_row.user_id,
    booking_row.owner_id,
    booking_row.court_id,
    booking_row.venue_id,
    booking_row.sport_type,
    booking_row.city,
    booking_row.booking_date,
    booking_row.start_time,
    booking_row.end_time,
    _needed_players,
    0,
    'open',
    NULLIF(trim(_skill_level), ''),
    NULLIF(trim(_notes), ''),
    COALESCE(NULLIF(trim(booking_row.host_display_name), ''), 'Host')
  )
  ON CONFLICT (booking_id)
  DO UPDATE
    SET needed_players = EXCLUDED.needed_players,
        skill_level = EXCLUDED.skill_level,
        notes = EXCLUDED.notes,
        host_display_name = EXCLUDED.host_display_name,
        status = CASE
          WHEN EXCLUDED.match_date < current_date
               OR (EXCLUDED.match_date = current_date AND EXCLUDED.start_time <= localtime) THEN 'completed'::public.match_post_status
          WHEN match_posts.joined_players >= EXCLUDED.needed_players THEN 'full'::public.match_post_status
          ELSE 'open'::public.match_post_status
        END,
        updated_at = now()
  RETURNING * INTO result_row;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    booking_row.user_id,
    'Need Players post is live',
    'Your booking is now visible in Match Finder.',
    'info'
  );

  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_match_post(
  _post_id UUID,
  _user_id UUID
)
RETURNS public.match_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_row public.match_posts;
  updated_post public.match_posts;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO post_row
  FROM public.match_posts
  WHERE id = _post_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match post not found';
  END IF;

  IF post_row.status <> 'open' THEN
    RAISE EXCEPTION 'This match is no longer open';
  END IF;

  IF post_row.host_user_id = _user_id THEN
    RAISE EXCEPTION 'Host cannot join own match post';
  END IF;

  IF post_row.match_date < current_date
     OR (post_row.match_date = current_date AND post_row.start_time <= localtime) THEN
    UPDATE public.match_posts
    SET status = 'completed', updated_at = now()
    WHERE id = _post_id;
    RAISE EXCEPTION 'Match already started';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_participants
    WHERE post_id = _post_id
      AND user_id = _user_id
      AND status = 'joined'
  ) THEN
    RAISE EXCEPTION 'You already joined this match';
  END IF;

  IF post_row.joined_players >= post_row.needed_players THEN
    UPDATE public.match_posts
    SET status = 'full', updated_at = now()
    WHERE id = _post_id;
    RAISE EXCEPTION 'This match is already full';
  END IF;

  INSERT INTO public.match_participants (post_id, user_id, status)
  VALUES (_post_id, _user_id, 'joined')
  ON CONFLICT (post_id, user_id)
  DO UPDATE SET
    status = 'joined',
    cancelled_at = NULL,
    updated_at = now(),
    joined_at = now();

  UPDATE public.match_posts
  SET
    joined_players = joined_players + 1,
    status = CASE WHEN joined_players + 1 >= needed_players THEN 'full' ELSE 'open' END,
    updated_at = now()
  WHERE id = _post_id
  RETURNING * INTO updated_post;

  INSERT INTO public.player_reliability (user_id, joined_count, last_event_at)
  VALUES (_user_id, 1, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    joined_count = player_reliability.joined_count + 1,
    last_event_at = now(),
    updated_at = now();

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    post_row.host_user_id,
    'Player joined your match',
    'A player joined your open match request.',
    'success'
  );

  RETURN updated_post;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_match_post(
  _post_id UUID,
  _user_id UUID
)
RETURNS public.match_posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_row public.match_posts;
  updated_post public.match_posts;
  was_deleted UUID;
  is_late_cancel BOOLEAN := FALSE;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO post_row
  FROM public.match_posts
  WHERE id = _post_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match post not found';
  END IF;

  IF post_row.match_date < current_date
     OR (post_row.match_date = current_date AND post_row.start_time <= localtime) THEN
    RAISE EXCEPTION 'Cannot leave after match start';
  END IF;

  DELETE FROM public.match_participants
  WHERE post_id = _post_id
    AND user_id = _user_id
    AND status = 'joined'
  RETURNING id INTO was_deleted;

  IF was_deleted IS NULL THEN
    RAISE EXCEPTION 'You are not joined in this match';
  END IF;

  UPDATE public.match_posts
  SET
    joined_players = GREATEST(joined_players - 1, 0),
    status = CASE
      WHEN status IN ('cancelled', 'completed') THEN status
      ELSE 'open'
    END,
    updated_at = now()
  WHERE id = _post_id
  RETURNING * INTO updated_post;

  is_late_cancel := (
    (post_row.match_date::timestamp + post_row.start_time)
    <= (now() + interval '2 hours')
  );

  INSERT INTO public.player_reliability (user_id, late_cancel_count, score, last_event_at)
  VALUES (
    _user_id,
    CASE WHEN is_late_cancel THEN 1 ELSE 0 END,
    CASE WHEN is_late_cancel THEN 95 ELSE 100 END,
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    late_cancel_count = player_reliability.late_cancel_count + CASE WHEN is_late_cancel THEN 1 ELSE 0 END,
    score = GREATEST(
      0,
      player_reliability.score - CASE WHEN is_late_cancel THEN 5 ELSE 0 END
    ),
    last_event_at = now(),
    updated_at = now();

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    post_row.host_user_id,
    'Player left your match',
    'A player left your open match request.',
    'info'
  );

  RETURN updated_post;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_expired_match_posts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_count INTEGER := 0;
BEGIN
  UPDATE public.match_posts mp
  SET
    status = CASE
      WHEN b.status = 'cancelled' THEN 'cancelled'::public.match_post_status
      WHEN b.status = 'completed' THEN 'completed'::public.match_post_status
      ELSE 'completed'::public.match_post_status
    END,
    updated_at = now()
  FROM public.bookings b
  WHERE b.id = mp.booking_id
    AND mp.status IN ('open', 'full')
    AND (
      b.status IN ('cancelled', 'completed')
      OR mp.match_date < current_date
      OR (mp.match_date = current_date AND mp.end_time <= localtime)
    );

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_match_post_from_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.match_posts mp
  SET
    match_date = NEW.booking_date,
    start_time = NEW.start_time,
    end_time = NEW.end_time,
    status = CASE
      WHEN NEW.status = 'cancelled' THEN 'cancelled'::public.match_post_status
      WHEN NEW.status = 'completed' THEN 'completed'::public.match_post_status
      WHEN NEW.booking_date < current_date
           OR (NEW.booking_date = current_date AND NEW.start_time <= localtime) THEN 'completed'::public.match_post_status
      WHEN mp.joined_players >= mp.needed_players THEN 'full'::public.match_post_status
      ELSE 'open'::public.match_post_status
    END,
    updated_at = now()
  WHERE mp.booking_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_match_post_from_booking ON public.bookings;
CREATE TRIGGER trg_sync_match_post_from_booking
AFTER UPDATE OF booking_date, start_time, end_time, status
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.sync_match_post_from_booking();

CREATE TRIGGER update_match_posts_updated_at
BEFORE UPDATE ON public.match_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_match_participants_updated_at
BEFORE UPDATE ON public.match_participants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_player_reliability_updated_at
BEFORE UPDATE ON public.player_reliability
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON FUNCTION public.create_match_post_from_booking(UUID, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_match_post(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_match_post(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_expired_match_posts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_match_post_from_booking(UUID, UUID, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_match_post(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_match_post(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_expired_match_posts() TO authenticated, service_role;