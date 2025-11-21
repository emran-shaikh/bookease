-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  read BOOLEAN NOT NULL DEFAULT false,
  related_court_id UUID REFERENCES public.courts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- Function to create notification when court status changes
CREATE OR REPLACE FUNCTION public.notify_court_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  -- Only create notification if status changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'approved' THEN
        notification_title := 'Court Approved! 🎉';
        notification_message := 'Your court "' || NEW.name || '" has been approved and is now live!';
      WHEN 'rejected' THEN
        notification_title := 'Court Rejected';
        notification_message := 'Unfortunately, your court "' || NEW.name || '" has been rejected. Please contact support for details.';
      ELSE
        notification_title := 'Court Status Updated';
        notification_message := 'Your court "' || NEW.name || '" status has been updated to ' || NEW.status || '.';
    END CASE;

    -- Insert notification
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      related_court_id
    ) VALUES (
      NEW.owner_id,
      notification_title,
      notification_message,
      CASE NEW.status
        WHEN 'approved' THEN 'success'
        WHEN 'rejected' THEN 'error'
        ELSE 'info'
      END,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for court status changes
CREATE TRIGGER on_court_status_change
AFTER UPDATE ON public.courts
FOR EACH ROW
EXECUTE FUNCTION public.notify_court_status_change();