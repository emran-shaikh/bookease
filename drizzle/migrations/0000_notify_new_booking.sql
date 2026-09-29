CREATE OR REPLACE FUNCTION public.notify_new_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  c RECORD;
  place TEXT;
  cust TEXT;
  msg TEXT;
BEGIN
  SELECT co.name, co.owner_id, v.name AS venue_name INTO c
  FROM public.courts co LEFT JOIN public.venues v ON v.id = co.venue_id
  WHERE co.id = NEW.court_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, email) INTO cust FROM public.profiles WHERE id = NEW.user_id;
  place := CASE WHEN c.venue_name IS NOT NULL THEN c.venue_name || ' – ' || c.name ELSE c.name END;
  msg := COALESCE(cust, 'A customer') || ' booked ' || place || ' on ' || to_char(NEW.booking_date, 'Mon DD, YYYY')
         || ' (' || to_char(NEW.start_time, 'HH12:MI AM') || ' - ' || to_char(NEW.end_time, 'HH12:MI AM') || ').';

  INSERT INTO public.notifications (user_id, title, message, type, related_court_id)
  SELECT DISTINCT r.uid, 'New booking received', msg, 'info', NEW.court_id
  FROM (
    SELECT c.owner_id AS uid
    UNION SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'
  ) r
  WHERE r.uid IS NOT NULL AND r.uid <> NEW.user_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_new_booking() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_new_booking ON public.bookings;
CREATE TRIGGER trg_notify_new_booking AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_new_booking();