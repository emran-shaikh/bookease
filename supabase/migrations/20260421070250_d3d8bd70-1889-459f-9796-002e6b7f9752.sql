ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source_updated_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source_updated_by text DEFAULT 'site';

UPDATE public.bookings
SET source_updated_at = COALESCE(updated_at, created_at, now())
WHERE source_updated_at IS NULL;

UPDATE public.bookings
SET source_updated_by = 'site'
WHERE source_updated_by IS NULL;

ALTER TABLE public.bookings
  ALTER COLUMN source_updated_at SET NOT NULL,
  ALTER COLUMN source_updated_by SET NOT NULL;

ALTER TABLE public.sheet_integrations
  ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_pull_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_push_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sync_cursor text;

UPDATE public.sheet_integrations
SET auto_sync_enabled = true
WHERE auto_sync_enabled IS NULL;

ALTER TABLE public.sheet_integrations
  ALTER COLUMN auto_sync_enabled SET NOT NULL;

ALTER TABLE public.sheet_sync_logs
  ADD COLUMN IF NOT EXISTS run_type text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS records_created integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_updated integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_cancelled integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_skipped integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_conflicted integer DEFAULT 0;

UPDATE public.sheet_sync_logs
SET run_type = 'manual'
WHERE run_type IS NULL;

UPDATE public.sheet_sync_logs
SET records_created = COALESCE(records_created, 0),
    records_updated = COALESCE(records_updated, 0),
    records_cancelled = COALESCE(records_cancelled, 0),
    records_skipped = COALESCE(records_skipped, 0),
    records_conflicted = COALESCE(records_conflicted, 0);

ALTER TABLE public.sheet_sync_logs
  ALTER COLUMN run_type SET NOT NULL,
  ALTER COLUMN records_created SET NOT NULL,
  ALTER COLUMN records_updated SET NOT NULL,
  ALTER COLUMN records_cancelled SET NOT NULL,
  ALTER COLUMN records_skipped SET NOT NULL,
  ALTER COLUMN records_conflicted SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.sheet_booking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.sheet_integrations(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  sheet_row_key text NOT NULL,
  row_hash text,
  last_seen_at timestamp with time zone,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (integration_id, booking_id),
  UNIQUE (integration_id, sheet_row_key)
);

CREATE INDEX IF NOT EXISTS idx_sheet_booking_links_integration_id ON public.sheet_booking_links(integration_id);
CREATE INDEX IF NOT EXISTS idx_sheet_booking_links_booking_id ON public.sheet_booking_links(booking_id);
CREATE INDEX IF NOT EXISTS idx_sheet_booking_links_sheet_row_key ON public.sheet_booking_links(sheet_row_key);

ALTER TABLE public.sheet_booking_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view own sheet booking links" ON public.sheet_booking_links;
CREATE POLICY "Owners can view own sheet booking links"
ON public.sheet_booking_links
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sheet_integrations si
    WHERE si.id = sheet_booking_links.integration_id
      AND si.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can view all sheet booking links" ON public.sheet_booking_links;
CREATE POLICY "Admins can view all sheet booking links"
ON public.sheet_booking_links
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_booking_source_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source_updated_at IS NULL THEN
      NEW.source_updated_at := now();
    END IF;
    IF NEW.source_updated_by IS NULL OR NEW.source_updated_by = '' THEN
      NEW.source_updated_by := 'site';
    END IF;
  ELSE
    IF NEW.source_updated_at IS NULL OR NEW.source_updated_at = OLD.source_updated_at THEN
      NEW.source_updated_at := now();
    END IF;
    IF NEW.source_updated_by IS NULL OR NEW.source_updated_by = '' THEN
      NEW.source_updated_by := 'site';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_booking_source_metadata_trigger ON public.bookings;
CREATE TRIGGER set_booking_source_metadata_trigger
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.set_booking_source_metadata();