-- Create slot_locks table for temporary slot reservations
CREATE TABLE public.slot_locks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.slot_locks ENABLE ROW LEVEL SECURITY;

-- Users can view all locks (to check availability)
CREATE POLICY "Anyone can view slot locks"
ON public.slot_locks
FOR SELECT
USING (true);

-- Users can create locks for themselves
CREATE POLICY "Users can create own slot locks"
ON public.slot_locks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own expired locks
CREATE POLICY "Users can delete own slot locks"
ON public.slot_locks
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_slot_locks_court_date ON public.slot_locks(court_id, booking_date);
CREATE INDEX idx_slot_locks_expires_at ON public.slot_locks(expires_at);

-- Function to clean up expired locks
CREATE OR REPLACE FUNCTION public.cleanup_expired_slot_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.slot_locks
  WHERE expires_at < now();
END;
$$;