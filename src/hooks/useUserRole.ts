import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

type UserRole = 'admin' | 'court_owner' | 'customer' | null;

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRole() {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      // Fetch all roles for the user
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (!error && data && data.length > 0) {
        // Priority: admin > court_owner > customer
        const roles = data.map(r => r.role as UserRole);
        if (roles.includes('admin')) {
          setRole('admin');
        } else if (roles.includes('court_owner')) {
          setRole('court_owner');
        } else {
          setRole('customer');
        }
      }
      setLoading(false);
    }

    fetchRole();
  }, [user]);

  return { role, loading, isAdmin: role === 'admin', isOwner: role === 'court_owner', isCustomer: role === 'customer' };
}
