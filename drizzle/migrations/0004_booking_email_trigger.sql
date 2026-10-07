CREATE TABLE IF NOT EXISTS public.internal_config (key text PRIMARY KEY, value text NOT NULL);
GRANT ALL ON public.internal_config TO service_role;
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.internal_config (key, value)
VALUES ('booking_email_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.booking_email_log (
  booking_id uuid NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, kind)
);
GRANT ALL ON public.booking_email_log TO service_role;
ALTER TABLE public.booking_email_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.trigger_booking_emails()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  is_pending boolean;
  secret text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' THEN is_pending := false;
    ELSIF NEW.status = 'pending' THEN is_pending := true;
    ELSE RETURN NEW; END IF;
  ELSE
    IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN is_pending := false;
    ELSE RETURN NEW; END IF;
  END IF;

  SELECT value INTO secret FROM public.internal_config WHERE key = 'booking_email_secret';

  PERFORM net.http_post(
    url := 'https://uhmtrnmsrbeaizjxoily.supabase.co/functions/v1/send-booking-confirmation',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', secret),
    body := jsonb_build_object('bookingId', NEW.id, 'isPendingPayment', is_pending)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trigger_booking_emails() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_booking_emails ON public.bookings;
CREATE TRIGGER trg_booking_emails AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trigger_booking_emails();