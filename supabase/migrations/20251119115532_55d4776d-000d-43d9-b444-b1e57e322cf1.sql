-- Create a trigger to automatically assign roles based on email for test accounts
CREATE OR REPLACE FUNCTION public.assign_test_account_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if this is a test account and assign appropriate role
  IF NEW.email = 'admin@test.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NEW.email = 'owner@test.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'court_owner')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF NEW.email = 'customer@test.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table to assign roles automatically
DROP TRIGGER IF EXISTS on_test_account_created ON public.profiles;
CREATE TRIGGER on_test_account_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_test_account_roles();