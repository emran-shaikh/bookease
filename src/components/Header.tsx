import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { User, LayoutDashboard, LogOut, Calendar, Heart, Menu, Trophy } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';

export function Header() {
  const { user, signOut } = useAuth();
  const { role } = useUserRole();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUserName() {
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        setUserName(data?.full_name || user.email?.split('@')[0] || null);
      } else {
        setUserName(null);
      }
    }
    fetchUserName();
  }, [user]);

  const getDashboardPath = () => {
    if (role === 'admin') return '/admin';
    if (role === 'court_owner') return '/owner';
    return '/dashboard';
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 sm:h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center space-x-2">
          <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <span className="text-lg sm:text-xl font-bold">BookedHours</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-4 lg:gap-6">
          <Link to="/sports" className="text-sm font-medium hover:text-primary transition-colors">
            Sports
          </Link>
          <Link to="/venues" className="text-sm font-medium hover:text-primary transition-colors">
            Venues
          </Link>
          <Link to="/courts" className="text-sm font-medium hover:text-primary transition-colors">
            Courts
          </Link>
          {user ? (
            <>
              <Link to="/favorites" className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-1">
                <Heart className="h-4 w-4" />
                Favorites
              </Link>
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    <span className="max-w-[100px] truncate">{userName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(getDashboardPath())}>
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Sign In</Link>
            </Button>
          )}
        </nav>

        {/* Mobile Navigation */}
        <div className="flex md:hidden items-center gap-2">
          {user && <NotificationBell />}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:w-[320px]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  BookedHours
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 mt-6">
                {user && userName && (
                  <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground">
                    <User className="h-4 w-4" />
                    {userName}
                  </div>
                )}
                <Button
                  variant="ghost"
                  className="justify-start h-12 text-base"
                  onClick={() => handleNavigation('/sports')}
                >
                  <Trophy className="mr-2 h-5 w-5" />
                  Sports
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start h-12 text-base"
                  onClick={() => handleNavigation('/venues')}
                >
                  Venues
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start h-12 text-base"
                  onClick={() => handleNavigation('/courts')}
                >
                  Courts
                </Button>
                {user ? (
                  <>
                    <Button
                      variant="ghost"
                      className="justify-start h-12 text-base"
                      onClick={() => handleNavigation('/favorites')}
                    >
                      <Heart className="mr-2 h-5 w-5" />
                      Favorites
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start h-12 text-base"
                      onClick={() => handleNavigation(getDashboardPath())}
                    >
                      <LayoutDashboard className="mr-2 h-5 w-5" />
                      Dashboard
                    </Button>
                    <div className="border-t my-2" />
                    <Button
                      variant="ghost"
                      className="justify-start h-12 text-base text-destructive hover:text-destructive"
                      onClick={() => {
                        signOut();
                        setMobileMenuOpen(false);
                      }}
                    >
                      <LogOut className="mr-2 h-5 w-5" />
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <Button
                    className="mt-4 h-12"
                    onClick={() => handleNavigation('/auth')}
                  >
                    Sign In
                  </Button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
