import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  allowedRole: 'admin' | 'court_owner' | 'customer';
}

export function RoleProtectedRoute({ children, allowedRole }: RoleProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (role !== allowedRole) {
    // Redirect to their correct dashboard
    if (role === 'admin') {
      return <Navigate to="/admin" replace />;
    } else if (role === 'court_owner') {
      return <Navigate to="/owner" replace />;
    } else {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}
