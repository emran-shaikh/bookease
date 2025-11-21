-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Anyone can view approved courts" ON public.courts;

-- Create a new permissive policy that explicitly allows anonymous access to approved courts
CREATE POLICY "Public can view approved active courts"
ON public.courts
FOR SELECT
USING (
  status = 'approved' AND is_active = true
);

-- Create a separate policy for owners to view their own courts
CREATE POLICY "Owners can view own courts"
ON public.courts
FOR SELECT
USING (
  auth.uid() = owner_id
);

-- Create a separate policy for admins to view all courts
CREATE POLICY "Admins can view all courts"
ON public.courts
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
);