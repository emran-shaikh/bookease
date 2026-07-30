DROP POLICY IF EXISTS "Anyone can view holidays" ON public.holidays;
CREATE POLICY "Anyone can view holidays"
ON public.holidays
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can view slot locks" ON public.slot_locks;
CREATE POLICY "Users can view own slot locks"
ON public.slot_locks
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);