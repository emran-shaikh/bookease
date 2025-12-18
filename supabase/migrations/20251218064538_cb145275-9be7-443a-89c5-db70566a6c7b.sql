-- Allow court owners to view profiles of customers who have booked their courts
CREATE POLICY "Court owners can view customer profiles for their bookings" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM bookings b
    JOIN courts c ON b.court_id = c.id
    WHERE b.user_id = profiles.id 
    AND c.owner_id = auth.uid()
  )
);