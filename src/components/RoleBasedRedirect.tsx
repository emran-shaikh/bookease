import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';

export function RoleBasedRedirect() {
  const { role, loading } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && role) {
      // Redirect based on primary role
      if (role === 'admin') {
        navigate('/admin');
      } else if (role === 'court_owner') {
        navigate('/owner');
      } else {
        navigate('/dashboard');
      }
    }
  }, [role, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return null;
}
