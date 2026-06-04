DROP POLICY IF EXISTS "Authenticated users can listen to authorized realtime channels" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can send authorized realtime messages" ON realtime.messages;

CREATE POLICY "Authenticated users can listen to authorized realtime channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'postgres_changes'
  AND (
    topic = 'slot_locks_changes'
    OR (
      split_part(topic, ':', 1) = 'notifications'
      AND split_part(topic, ':', 2) = auth.uid()::text
    )
    OR (
      split_part(topic, ':', 1) = 'favorites'
      AND split_part(topic, ':', 2) = auth.uid()::text
    )
    OR (
      split_part(topic, ':', 1) = 'court_bookings'
      AND EXISTS (
        SELECT 1
        FROM public.courts c
        WHERE c.id::text = split_part(topic, ':', 2)
          AND c.owner_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Authenticated users can send authorized realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  extension = 'postgres_changes'
  AND (
    topic = 'slot_locks_changes'
    OR (
      split_part(topic, ':', 1) = 'notifications'
      AND split_part(topic, ':', 2) = auth.uid()::text
    )
    OR (
      split_part(topic, ':', 1) = 'favorites'
      AND split_part(topic, ':', 2) = auth.uid()::text
    )
    OR (
      split_part(topic, ':', 1) = 'court_bookings'
      AND EXISTS (
        SELECT 1
        FROM public.courts c
        WHERE c.id::text = split_part(topic, ':', 2)
          AND c.owner_id = auth.uid()
      )
    )
  )
);