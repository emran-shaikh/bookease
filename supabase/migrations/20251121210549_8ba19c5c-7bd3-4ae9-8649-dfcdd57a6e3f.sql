-- Add city field to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS city text;

-- Update the profiles table to ensure phone is stored correctly
COMMENT ON COLUMN public.profiles.phone IS 'User mobile/phone number';
COMMENT ON COLUMN public.profiles.city IS 'User default city for bookings';