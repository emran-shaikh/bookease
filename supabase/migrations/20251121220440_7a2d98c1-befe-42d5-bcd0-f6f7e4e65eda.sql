-- First, remove duplicate bookings (keep the earliest one)
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (
           PARTITION BY court_id, booking_date, start_time, end_time, status
           ORDER BY created_at ASC
         ) as rn
  FROM public.bookings
  WHERE status IN ('confirmed', 'pending')
)
DELETE FROM public.bookings
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Now add unique constraint to prevent overlapping bookings
CREATE UNIQUE INDEX IF NOT EXISTS unique_booking_slot 
ON public.bookings (court_id, booking_date, start_time, end_time)
WHERE status IN ('confirmed', 'pending');

-- Enable realtime for bookings table
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;

-- Enable realtime for slot_locks table
ALTER TABLE public.slot_locks REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'slot_locks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.slot_locks;
  END IF;
END $$;

-- Add a function to check for overlapping bookings
CREATE OR REPLACE FUNCTION public.check_booking_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE court_id = NEW.court_id
    AND booking_date = NEW.booking_date
    AND status IN ('confirmed', 'pending')
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (start_time, end_time) OVERLAPS (NEW.start_time, NEW.end_time)
  ) THEN
    RAISE EXCEPTION 'This time slot overlaps with an existing booking';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to check for overlapping bookings
DROP TRIGGER IF EXISTS check_booking_overlap_trigger ON public.bookings;
CREATE TRIGGER check_booking_overlap_trigger
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.check_booking_overlap();