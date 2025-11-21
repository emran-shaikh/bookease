import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export function useProfileCompletion() {
  const { user } = useAuth();
  const [isProfileComplete, setIsProfileComplete] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkProfile() {
      if (!user) {
        setIsProfileComplete(null);
        setLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name, phone, city')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        setIsProfileComplete(false);
        setLoading(false);
        return;
      }

      // Check if all required fields are filled
      const isComplete = !!(
        profile?.full_name?.trim() &&
        profile?.phone?.trim() &&
        profile?.city?.trim()
      );

      setIsProfileComplete(isComplete);
      setLoading(false);
    }

    checkProfile();
  }, [user]);

  return { isProfileComplete, loading };
}
