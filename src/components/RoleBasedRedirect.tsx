import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';

export function RoleBasedRedirect() {
  const { role, loading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      // Redirect based on primary role, default to dashboard if no role found
      if (role === 'admin') {
        navigate('/admin');
      } else if (role === 'court_owner') {
        navigate('/owner');
      } else {
        // Default redirect for 'customer' role or when no role is assigned
        navigate('/dashboard');
      }
    }
  }, [role, loading, navigate]);

  // Always show loading spinner while determining redirect
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
