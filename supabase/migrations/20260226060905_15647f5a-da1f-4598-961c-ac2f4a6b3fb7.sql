
-- Add n8n_webhook_url to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS n8n_webhook_url text;

-- Create whatsapp_sessions table
CREATE TABLE public.whatsapp_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text NOT NULL,
  user_id uuid REFERENCES public.profiles(id),
  conversation_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_sessions_phone ON public.whatsapp_sessions(phone_number);
CREATE INDEX idx_whatsapp_sessions_last_message ON public.whatsapp_sessions(last_message_at);

-- RLS: service role only (edge functions use service role key)
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (no user-facing policies needed)
CREATE POLICY "Service role full access" ON public.whatsapp_sessions
  FOR ALL USING (true) WITH CHECK (true);

-- Create payment-screenshots bucket for WhatsApp media
INSERT INTO storage.buckets (id, name, public) 
VALUES ('payment-screenshots', 'payment-screenshots', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view payment screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-screenshots');

CREATE POLICY "Service role can upload payment screenshots"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'payment-screenshots');
