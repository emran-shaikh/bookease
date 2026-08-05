import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const returnPath = useMemo(() => {
    const rawReturn = searchParams.get('return');
    if (!rawReturn || !rawReturn.startsWith('/')) return '/';
    return rawReturn;
  }, [searchParams]);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the session from the URL hash
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth callback error:', error);
          navigate('/auth?error=callback_failed');
          return;
        }

        if (session) {
          // Successfully authenticated, redirect to intended destination
          navigate(returnPath, { replace: true });
        } else {
          // No session, redirect to auth page
          navigate(`/auth?return=${encodeURIComponent(returnPath)}`, { replace: true });
        }
      } catch (err) {
        console.error('Auth callback exception:', err);
        navigate(`/auth?error=callback_failed&return=${encodeURIComponent(returnPath)}`);
      }
    };

    handleAuthCallback();
  }, [navigate, returnPath]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
