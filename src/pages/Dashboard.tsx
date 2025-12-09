import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Header } from '@/components/Header';
import { SEO } from '@/components/SEO';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Calendar, Star, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { formatPrice } from '@/lib/currency';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  async function fetchDashboardData() {
    try {
      const [profileData, bookingsData, reviewsData] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user?.id).single(),
        supabase.from('bookings').select(`
          *,
          courts (name, location, city, images)
        `).eq('user_id', user?.id).order('booking_date', { ascending: false }),
        supabase.from('reviews').select('booking_id').eq('user_id', user?.id),
      ]);

      if (profileData.error) throw profileData.error;
      if (bookingsData.error) throw bookingsData.error;

      setProfile(profileData.data);
      setBookings(bookingsData.data || []);
      setReviews(reviewsData.data || []);
    } catch (error: any) {
      toast({
        title: 'Error loading dashboard',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const upcomingBookings = bookings.filter(b => 
    new Date(b.booking_date) >= new Date() && b.status !== 'cancelled'
  );
  
  const pastBookings = bookings.filter(b => 
    new Date(b.booking_date) < new Date() || b.status === 'completed'
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title="My Dashboard"
        description="View and manage your court bookings, upcoming reservations, and past bookings on BookedHours."
        keywords="dashboard, my bookings, reservations, booking history"
      />
      <Header />
      
      <main className="container py-4 sm:py-6 md:py-8 px-4">
        <div className="mb-4 sm:mb-6 md:mb-8">
          <h1 className="mb-1 sm:mb-2 text-xl sm:text-2xl md:text-3xl font-bold">My Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Manage your bookings and profile</p>
        </div>

        <div className="grid gap-3 sm:gap-4 md:gap-6 grid-cols-3 mb-4 sm:mb-6 md:mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-4 md:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Total</CardTitle>
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
              <div className="text-lg sm:text-xl md:text-2xl font-bold">{bookings.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-4 md:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Upcoming</CardTitle>
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
              <div className="text-lg sm:text-xl md:text-2xl font-bold">{upcomingBookings.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-4 md:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Done</CardTitle>
              <Star className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
              <div className="text-lg sm:text-xl md:text-2xl font-bold">{pastBookings.length}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="upcoming" className="space-y-3 sm:space-y-4">
          <TabsList className="w-full grid grid-cols-3 h-9 sm:h-10">
            <TabsTrigger value="upcoming" className="text-xs sm:text-sm px-1 sm:px-3">Upcoming</TabsTrigger>
            <TabsTrigger value="past" className="text-xs sm:text-sm px-1 sm:px-3">Past</TabsTrigger>
            <TabsTrigger value="profile" className="text-xs sm:text-sm px-1 sm:px-3">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-3 sm:space-y-4">
            {upcomingBookings.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12">
                  <Calendar className="mb-3 sm:mb-4 h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground" />
                  <p className="mb-3 sm:mb-4 text-xs sm:text-sm text-muted-foreground">No upcoming bookings</p>
                  <Button onClick={() => navigate('/courts')} size="sm" className="h-8 sm:h-9 text-xs sm:text-sm">Browse Courts</Button>
                </CardContent>
              </Card>
            ) : (
              upcomingBookings.map((booking) => (
                <Card key={booking.id}>
                  <CardHeader className="p-3 sm:p-4 md:p-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-sm sm:text-base md:text-lg truncate">{booking.courts?.name}</CardTitle>
                        <CardDescription className="text-xs sm:text-sm truncate">
                          {booking.courts?.city}, {booking.courts?.location}
                        </CardDescription>
                      </div>
                      <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'} className="text-[10px] sm:text-xs flex-shrink-0">
                        {booking.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
                    <div className="grid gap-1 sm:gap-2 text-xs sm:text-sm">
                      <div>
                        <span className="font-medium">Date:</span>{' '}
                        {format(new Date(booking.booking_date), 'MMM d, yyyy')}
                      </div>
                      <div>
                        <span className="font-medium">Time:</span>{' '}
                        {booking.start_time} - {booking.end_time}
                      </div>
                      <div>
                        <span className="font-medium">Total:</span> {formatPrice(booking.total_price)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-3 sm:space-y-4">
            {pastBookings.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12">
                  <Calendar className="mb-3 sm:mb-4 h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground" />
                  <p className="text-xs sm:text-sm text-muted-foreground">No past bookings</p>
                </CardContent>
              </Card>
            ) : (
              pastBookings.map((booking) => (
                <Card key={booking.id}>
                  <CardHeader className="p-3 sm:p-4 md:p-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-sm sm:text-base md:text-lg truncate">{booking.courts?.name}</CardTitle>
                        <CardDescription className="text-xs sm:text-sm truncate">
                          {booking.courts?.city}, {booking.courts?.location}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="text-[10px] sm:text-xs flex-shrink-0">{booking.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
                    <div className="grid gap-1 sm:gap-2 text-xs sm:text-sm mb-3 sm:mb-4">
                      <div>
                        <span className="font-medium">Date:</span>{' '}
                        {format(new Date(booking.booking_date), 'MMM d, yyyy')}
                      </div>
                      <div>
                        <span className="font-medium">Time:</span>{' '}
                        {booking.start_time} - {booking.end_time}
                      </div>
                      <div>
                        <span className="font-medium">Total:</span> {formatPrice(booking.total_price)}
                      </div>
                    </div>
                    {reviews.some(r => r.booking_id === booking.id) ? (
                      <Badge variant="default" className="gap-1 text-[10px] sm:text-xs">
                        <Star className="h-2.5 w-2.5 sm:h-3 sm:w-3 fill-current" />
                        Reviewed
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 sm:h-8 text-xs"
                        onClick={() => navigate(`/review/${booking.id}`)}
                      >
                        <Star className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                        Review
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="profile">
            <Card>
              <CardHeader className="p-3 sm:p-4 md:p-6">
                <CardTitle className="text-base sm:text-lg">Profile Information</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Manage your account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-4 md:p-6 pt-0">
                <div>
                  <label className="text-xs sm:text-sm font-medium">Full Name</label>
                  <p className="text-xs sm:text-sm text-muted-foreground">{profile?.full_name || 'Not set'}</p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-medium">Email</label>
                  <p className="text-xs sm:text-sm text-muted-foreground break-all">{profile?.email}</p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-medium">Phone</label>
                  <p className="text-xs sm:text-sm text-muted-foreground">{profile?.phone || 'Not set'}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
