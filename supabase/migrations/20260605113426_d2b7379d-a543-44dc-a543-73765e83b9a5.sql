CREATE OR REPLACE FUNCTION public.join_match_post(_post_id uuid, _user_id uuid)
 RETURNS match_posts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  post_row public.match_posts;
  updated_post public.match_posts;
  recent_actions INTEGER := 0;
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
    SET status = 'completed'::public.match_post_status, updated_at = now()
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
    SET status = 'full'::public.match_post_status, updated_at = now()
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
    status = CASE WHEN joined_players + 1 >= needed_players THEN 'full'::public.match_post_status ELSE 'open'::public.match_post_status END,
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

  WITH recent AS (
    SELECT COUNT(*)::INTEGER + 1 AS recent_count
    FROM public.match_action_events
    WHERE user_id = _user_id
      AND event_at >= now() - interval '5 minutes'
  )
  INSERT INTO public.match_action_events (
    user_id,
    post_id,
    action,
    window_action_count,
    is_suspicious,
    suspicion_reason,
    metadata
  )
  SELECT
    _user_id,
    _post_id,
    'join',
    recent_count,
    (recent_count > 10),
    CASE WHEN recent_count > 10 THEN 'high_frequency_join_leave_activity' ELSE NULL END,
    jsonb_build_object('threshold', 10, 'window_minutes', 5)
  FROM recent
  RETURNING window_action_count INTO recent_actions;

  IF recent_actions > 10 THEN
    UPDATE public.player_reliability
    SET
      score = GREATEST(0, score - 3),
      last_event_at = now(),
      updated_at = now()
    WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    post_row.host_user_id,
    'Player joined your match',
    'A player joined your open match request.',
    'success'
  );

  RETURN updated_post;
END;
$function$;

CREATE OR REPLACE FUNCTION public.leave_match_post(_post_id uuid, _user_id uuid)
 RETURNS match_posts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  post_row public.match_posts;
  updated_post public.match_posts;
  was_deleted UUID;
  is_late_cancel BOOLEAN := FALSE;
  recent_actions INTEGER := 0;
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
      ELSE 'open'::public.match_post_status
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

  WITH recent AS (
    SELECT COUNT(*)::INTEGER + 1 AS recent_count
    FROM public.match_action_events
    WHERE user_id = _user_id
      AND event_at >= now() - interval '5 minutes'
  )
  INSERT INTO public.match_action_events (
    user_id,
    post_id,
    action,
    window_action_count,
    is_suspicious,
    suspicion_reason,
    metadata
  )
  SELECT
    _user_id,
    _post_id,
    'leave',
    recent_count,
    (recent_count > 10),
    CASE WHEN recent_count > 10 THEN 'high_frequency_join_leave_activity' ELSE NULL END,
    jsonb_build_object('threshold', 10, 'window_minutes', 5)
  FROM recent
  RETURNING window_action_count INTO recent_actions;

  IF recent_actions > 10 THEN
    UPDATE public.player_reliability
    SET
      score = GREATEST(0, score - 2),
      last_event_at = now(),
      updated_at = now()
    WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    post_row.host_user_id,
    'Player left your match',
    'A player left your open match request.',
    'info'
  );

  RETURN updated_post;
END;
$function$;