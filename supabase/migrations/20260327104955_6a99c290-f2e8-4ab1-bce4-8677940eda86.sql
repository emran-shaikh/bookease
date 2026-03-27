
-- Table to store owner's spreadsheet integrations
CREATE TABLE public.sheet_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sheet_url TEXT NOT NULL,
  sheet_id TEXT,
  platform TEXT NOT NULL DEFAULT 'google_sheets' CHECK (platform IN ('google_sheets', 'excel_online')),
  sheet_name TEXT DEFAULT 'Bookings',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'success', 'error')),
  sync_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sheet_integrations ENABLE ROW LEVEL SECURITY;

-- Owners can manage their own integrations
CREATE POLICY "Owners can view own sheet integrations"
  ON public.sheet_integrations FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert own sheet integrations"
  ON public.sheet_integrations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update own sheet integrations"
  ON public.sheet_integrations FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete own sheet integrations"
  ON public.sheet_integrations FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- Admins can view all
CREATE POLICY "Admins can view all sheet integrations"
  ON public.sheet_integrations FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Sync log table for tracking individual sync operations
CREATE TABLE public.sheet_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.sheet_integrations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('to_sheet', 'from_sheet')),
  records_synced INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_details TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.sheet_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own sync logs"
  ON public.sheet_sync_logs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sheet_integrations si
    WHERE si.id = sheet_sync_logs.integration_id
    AND si.owner_id = auth.uid()
  ));
