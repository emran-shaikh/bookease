-- Create venues table
CREATE TABLE public.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  location TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  images TEXT[] DEFAULT '{}',
  amenities TEXT[] DEFAULT '{}',
  slug TEXT NOT NULL UNIQUE,
  status court_status NOT NULL DEFAULT 'pending',
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_opening_time TIME DEFAULT '06:00',
  default_closing_time TIME DEFAULT '22:00',
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- Add venue_id column to courts (nullable for backward compatibility)
ALTER TABLE public.courts 
  ADD COLUMN venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;

-- Make location fields nullable for venue-linked courts
ALTER TABLE public.courts 
  ALTER COLUMN address DROP NOT NULL,
  ALTER COLUMN city DROP NOT NULL,
  ALTER COLUMN state DROP NOT NULL,
  ALTER COLUMN zip_code DROP NOT NULL,
  ALTER COLUMN location DROP NOT NULL;

-- Add court-specific override columns
ALTER TABLE public.courts 
  ADD COLUMN court_specific_images TEXT[] DEFAULT '{}',
  ADD COLUMN court_specific_amenities TEXT[] DEFAULT '{}',
  ADD COLUMN opening_time_override TIME,
  ADD COLUMN closing_time_override TIME;

-- Create index for venue lookups
CREATE INDEX idx_courts_venue_id ON public.courts(venue_id);

-- RLS Policies for venues

-- Public can view approved active venues
CREATE POLICY "Public can view approved active venues"
ON public.venues FOR SELECT
USING (status = 'approved' AND is_active = true);

-- Owners can view their own venues
CREATE POLICY "Owners can view own venues"
ON public.venues FOR SELECT
USING (auth.uid() = owner_id);

-- Admins can view all venues
CREATE POLICY "Admins can view all venues"
ON public.venues FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Owners can insert their own venues
CREATE POLICY "Owners can insert own venues"
ON public.venues FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- Owners can update their own venues
CREATE POLICY "Owners can update own venues"
ON public.venues FOR UPDATE
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

-- Admins can delete venues
CREATE POLICY "Admins can delete venues"
ON public.venues FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Venue slug generation function
CREATE OR REPLACE FUNCTION public.generate_venue_slug(venue_name text, venue_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  base_slug := lower(regexp_replace(
    regexp_replace(venue_name, '[^a-zA-Z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
  ));
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;
  
  WHILE EXISTS (SELECT 1 FROM venues WHERE slug = final_slug AND id != venue_id) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$;

-- Trigger function to set venue slug
CREATE OR REPLACE FUNCTION public.set_venue_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_venue_slug(NEW.name, COALESCE(NEW.id, gen_random_uuid()));
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for venue slug
CREATE TRIGGER set_venue_slug_trigger
BEFORE INSERT OR UPDATE ON public.venues
FOR EACH ROW EXECUTE FUNCTION public.set_venue_slug();

-- Trigger for updated_at
CREATE TRIGGER update_venues_updated_at
BEFORE UPDATE ON public.venues
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Venue status notification trigger
CREATE OR REPLACE FUNCTION public.notify_venue_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.owner_id,
      CASE NEW.status
        WHEN 'approved' THEN 'Venue Approved! 🎉'
        WHEN 'rejected' THEN 'Venue Rejected'
        ELSE 'Venue Status Updated'
      END,
      'Your venue "' || NEW.name || '" has been ' || NEW.status,
      CASE NEW.status WHEN 'approved' THEN 'success' WHEN 'rejected' THEN 'error' ELSE 'info' END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notify_venue_status_trigger
AFTER UPDATE ON public.venues
FOR EACH ROW EXECUTE FUNCTION public.notify_venue_status_change();