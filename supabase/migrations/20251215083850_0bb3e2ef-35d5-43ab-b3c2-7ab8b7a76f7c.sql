-- Add bank details and WhatsApp to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS account_title text,
ADD COLUMN IF NOT EXISTS account_number text,
ADD COLUMN IF NOT EXISTS whatsapp_number text;

-- Add payment_screenshot column to bookings table
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS payment_screenshot text;