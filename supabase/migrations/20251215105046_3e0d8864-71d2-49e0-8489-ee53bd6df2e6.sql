-- Create a policy to allow anyone to view bank/payment details of profiles (for court owners)
CREATE POLICY "Anyone can view owner payment details" 
ON public.profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM courts 
    WHERE courts.owner_id = profiles.id
  )
);