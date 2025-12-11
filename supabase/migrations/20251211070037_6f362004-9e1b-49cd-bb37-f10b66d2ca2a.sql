-- Add slug column to courts table
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS slug text;

-- Create unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS courts_slug_unique ON public.courts(slug);

-- Function to generate slug from name
CREATE OR REPLACE FUNCTION public.generate_court_slug(court_name text, court_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  -- Generate base slug from name
  base_slug := lower(regexp_replace(
    regexp_replace(court_name, '[^a-zA-Z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
  ));
  
  -- Remove multiple consecutive dashes
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  
  -- Remove leading/trailing dashes
  base_slug := trim(both '-' from base_slug);
  
  -- Start with base slug
  final_slug := base_slug;
  
  -- Check for uniqueness and add suffix if needed
  WHILE EXISTS (SELECT 1 FROM courts WHERE slug = final_slug AND id != court_id) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$function$;

-- Update existing courts with slugs
UPDATE public.courts
SET slug = public.generate_court_slug(name, id)
WHERE slug IS NULL;

-- Make slug NOT NULL after populating
ALTER TABLE public.courts ALTER COLUMN slug SET NOT NULL;

-- Trigger to auto-generate slug on insert/update
CREATE OR REPLACE FUNCTION public.set_court_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' OR (TG_OP = 'UPDATE' AND OLD.name != NEW.name AND NEW.slug = OLD.slug) THEN
    NEW.slug := public.generate_court_slug(NEW.name, COALESCE(NEW.id, gen_random_uuid()));
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_court_slug_trigger ON public.courts;
CREATE TRIGGER set_court_slug_trigger
BEFORE INSERT OR UPDATE ON public.courts
FOR EACH ROW
EXECUTE FUNCTION public.set_court_slug();