-- Create a function to get court booking counts (bypasses RLS for counting only)
CREATE OR REPLACE FUNCTION public.get_court_booking_count(court_uuid UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM bookings WHERE court_id = court_uuid;
$$;