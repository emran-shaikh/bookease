-- Add opening and closing hours columns to courts table
ALTER TABLE public.courts 
ADD COLUMN opening_time time without time zone DEFAULT '06:00'::time,
ADD COLUMN closing_time time without time zone DEFAULT '22:00'::time;

-- Update existing courts with default hours
UPDATE public.courts SET opening_time = '06:00', closing_time = '22:00' WHERE opening_time IS NULL;