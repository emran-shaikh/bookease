-- Add guest contact fields for manual bookings (blocked slots for guests)
ALTER TABLE public.blocked_slots 
ADD COLUMN guest_email text,
ADD COLUMN guest_phone text,
ADD COLUMN guest_name text;