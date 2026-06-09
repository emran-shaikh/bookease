import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Header } from '@/components/Header';
import { SEO } from '@/components/SEO';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Calendar, Star, User, Upload, Clock, AlertCircle, Users, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, addMinutes, isAfter } from 'date-fns';
import { formatPrice } from '@/lib/currency';
import { formatTimeSlot12h } from '@/lib/utils';
import { PaymentScreenshotUpload } from '@/components/PaymentScreenshotUpload';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [openingMatchBookingId, setOpeningMatchBookingId] = useState<string | null>(null);
  const [neededPlayersByBooking, setNeededPlayersByBooking] = useState<Record<string, string>>({});
  const [matchPostsByBooking, setMatchPostsByBooking] = useState<Record<string, any>>({});
  const [participantsByPost, setParticipantsByPost] = useState<Record<string, any[]>>({});
  const [guestRequestsByPost, setGuestRequestsByPost] = useState<Record<string, any[]>>({});
  const [requestActionLoadingId, setRequestActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`dashboard-match-host:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_posts',
          filter: `host_user_id=eq.${user.id}`,
        },
        () => {
          fetchDashboardData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_guest_contacts',
          filter: `host_user_id=eq.${user.id}`,
        },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  async function fetchDashboardData() {
    try {
      const [profileData, bookingsData, reviewsData, matchPostsData] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user?.id).maybeSingle(),
        supabase.from('bookings').select(`
          *,
          courts (name, location, city, images)
        `).eq('user_id', user?.id).order('booking_date', { ascending: false }),
        supabase.from('reviews').select('booking_id').eq('user_id', user?.id),
        supabase
          .from('match_posts')
          .select('id, booking_id, status, needed_players, joined_players')
          .eq('host_user_id', user?.id),
      ]);

      // Profile can be null for new users
      if (profileData.error && profileData.error.code !== 'PGRST116') {
        console.error('Error fetching profile:', profileData.error);
      }
      if (bookingsData.error) throw bookingsData.error;
      if (matchPostsData.error) throw matchPostsData.error;

      setProfile(profileData.data);
      setBookings(bookingsData.data || []);
      setReviews(reviewsData.data || []);
      const posts = (matchPostsData.data || []) as any[];
      setMatchPostsByBooking(
        posts.reduce((acc, post) => {
          acc[post.booking_id] = post;
          return acc;
        }, {} as Record<string, any>)
      );

      if (posts.length > 0) {
        const postIds = posts.map((post) => post.id);

        const [participantsData, guestRequestsData] = await Promise.all([
          supabase
            .from('match_participants')
            .select('id, post_id, user_id, status, joined_at, profiles(full_name, email, phone)')
            .in('post_id', postIds)
            .order('joined_at', { ascending: true }),
          supabase
            .from('match_guest_contacts')
            .select(`
              id,
              post_id,
              guest_name,
              guest_phone,
              guest_note,
              created_at,
              status,
              decided_at,
              contact_user_id,
              contact_profile:profiles!match_guest_contacts_contact_user_id_fkey(full_name, email, phone)
            `)
            .in('post_id', postIds)
            .order('created_at', { ascending: false }),
        ]);

        if (participantsData.error) throw participantsData.error;
        if (guestRequestsData.error) throw guestRequestsData.error;

        setParticipantsByPost(
          (participantsData.data || []).reduce((acc: Record<string, any[]>, participant: any) => {
            acc[participant.post_id] = [...(acc[participant.post_id] || []), participant];
            return acc;
          }, {})
        );

        setGuestRequestsByPost(
          (guestRequestsData.data || []).reduce((acc: Record<string, any[]>, request: any) => {
            acc[request.post_id] = [...(acc[request.post_id] || []), request];
            return acc;
          }, {})
        );
      } else {
        setParticipantsByPost({});
        setGuestRequestsByPost({});
      }
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

  async function handleGuestRequestDecision(contactId: string, nextStatus: 'accepted' | 'rejected') {
    if (!user?.id) return;

    try {
      setRequestActionLoadingId(contactId);
      const { error } = await supabase.rpc('update_guest_match_contact_status', {
        _contact_id: contactId,
        _status: nextStatus,
        _actor_user_id: user.id,
      });

      if (error) throw error;

      toast({
        title: nextStatus === 'accepted' ? 'Request accepted' : 'Request rejected',
        description: 'Guest request status has been updated.',
      });

      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: 'Could not update request',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setRequestActionLoadingId(null);
    }
  }

  async function handleOpenMatch(booking: any) {
    if (!user?.id) return;

    const neededPlayers = Number(neededPlayersByBooking[booking.id] || '2');
    if (Number.isNaN(neededPlayers) || neededPlayers < 1 || neededPlayers > 20) {
      toast({
        title: 'Invalid player count',
        description: 'Please choose between 1 and 20 players.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setOpeningMatchBookingId(booking.id);
      const { error } = await supabase.rpc('create_match_post_from_booking', {
        _booking_id: booking.id,
        _host_user_id: user.id,
        _needed_players: neededPlayers,
      });
      if (error) throw error;

      toast({ title: 'Match post is live', description: 'Players can now join your booking instantly.' });
      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: 'Could not open match',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setOpeningMatchBookingId(null);
    }
  }

  function bookingStartDateTime(booking: any) {
    // booking_date is YYYY-MM-DD, start_time is HH:mm:ss
    return new Date(`${booking.booking_date}T${String(booking.start_time).slice(0, 8)}`);
  }

  function bookingEndDateTime(booking: any) {
    return new Date(`${booking.booking_date}T${String(booking.end_time).slice(0, 8)}`);
  }

  const upcomingBookings = bookings.filter((b) => {
    const end = bookingEndDateTime(b);
    return end >= new Date() && b.status !== 'cancelled';
  });

  const pastBookings = bookings.filter((b) => {
    const end = bookingEndDateTime(b);
    return end < new Date() || b.status === 'completed';
  });

  // Calculate time remaining for pending bookings (30 minutes from creation)
  function getTimeRemaining(createdAt: string) {
    const createdDate = new Date(createdAt);
    const expiryDate = addMinutes(createdDate, 30);
    const now = new Date();
    
    if (isAfter(now, expiryDate)) {
      return { expired: true, minutes: 0 };
    }
    
    const diffMs = expiryDate.getTime() - now.getTime();
    const minutes = Math.ceil(diffMs / (1000 * 60));
    return { expired: false, minutes };
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
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
              upcomingBookings.map((booking) => {
                const isPending = booking.status === 'pending' && booking.payment_status === 'pending';
                const timeInfo = isPending ? getTimeRemaining(booking.created_at) : null;
                const hasScreenshot = !!booking.payment_screenshot;
                const matchPost = matchPostsByBooking[booking.id];

                return (
                  <Card key={booking.id} className={isPending ? 'border-amber-500/50' : ''}>
                    <CardHeader className="p-3 sm:p-4 md:p-6">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-sm sm:text-base md:text-lg truncate">{booking.courts?.name}</CardTitle>
                          <CardDescription className="text-xs sm:text-sm truncate">
                            {booking.courts?.city}, {booking.courts?.location}
                          </CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'} className="text-[10px] sm:text-xs flex-shrink-0">
                            {booking.status}
                          </Badge>
                          {isPending && timeInfo && !timeInfo.expired && (
                            <div className="flex items-center gap-1 text-amber-600 text-[10px]">
                              <Clock className="h-3 w-3" />
                              {timeInfo.minutes}m left
                            </div>
                          )}
                        </div>
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
                          {formatTimeSlot12h(booking.start_time, booking.end_time)}
                        </div>
                        <div>
                          <span className="font-medium">Total:</span> {formatPrice(booking.total_price)}
                        </div>
                      </div>

                      {/* Pending booking - show upload option */}
                      {isPending && (
                        <Collapsible 
                          open={expandedBooking === booking.id} 
                          onOpenChange={(open) => setExpandedBooking(open ? booking.id : null)}
                          className="mt-3"
                        >
                          {!hasScreenshot ? (
                            <>
                              <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-xs mb-2">
                                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                <span>Upload payment screenshot to confirm your booking</span>
                              </div>
                              <CollapsibleTrigger asChild>
                                <Button variant="outline" size="sm" className="w-full gap-2">
                                  <Upload className="h-4 w-4" />
                                  Add Payment Screenshot
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-3">
                                <PaymentScreenshotUpload
                                  bookingId={booking.id}
                                  existingScreenshot={booking.payment_screenshot}
                                  onUploadSuccess={fetchDashboardData}
                                />
                              </CollapsibleContent>
                            </>
                          ) : (
                            <div className="space-y-2">
                              <Badge variant="outline" className="gap-1 text-green-600 border-green-500">
                                <Upload className="h-3 w-3" />
                                Screenshot Uploaded
                              </Badge>
                              <p className="text-xs text-muted-foreground">
                                Waiting for owner to verify and confirm your booking.
                              </p>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="w-full text-xs">
                                  View/Replace Screenshot
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-3">
                                <PaymentScreenshotUpload
                                  bookingId={booking.id}
                                  existingScreenshot={booking.payment_screenshot}
                                  onUploadSuccess={fetchDashboardData}
                                />
                              </CollapsibleContent>
                            </div>
                          )}
                        </Collapsible>
                      )}

                      {(booking.status === 'confirmed' || booking.status === 'pending') && (
                        <div className="mt-3 rounded-md border p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium">Need Players</p>
                            {matchPost ? (
                              <Badge variant={matchPost.status === 'full' ? 'secondary' : 'default'}>
                                {matchPost.joined_players}/{matchPost.needed_players} • {matchPost.status}
                              </Badge>
                            ) : (
                              <Badge variant="outline">Not live</Badge>
                            )}
                          </div>

                          {!matchPost && (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={1}
                                max={20}
                                value={neededPlayersByBooking[booking.id] ?? '2'}
                                onChange={(e) =>
                                  setNeededPlayersByBooking((prev) => ({
                                    ...prev,
                                    [booking.id]: e.target.value,
                                  }))
                                }
                                className="h-8 text-xs"
                              />
                              <Button
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => handleOpenMatch(booking)}
                                disabled={openingMatchBookingId === booking.id}
                              >
                                {openingMatchBookingId === booking.id && (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                )}
                                <PlusCircle className="h-3 w-3 mr-1" />
                                Open Match
                              </Button>
                            </div>
                          )}

                          {matchPost && (
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] text-muted-foreground">
                                Players can join from Match Finder instantly.
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => navigate('/matches')}
                              >
                                <Users className="h-3 w-3 mr-1" />
                                View Feed
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
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
                        {formatTimeSlot12h(booking.start_time, booking.end_time)}
                      </div>
                      <div>
                        <span className="font-medium">Total:</span> {formatPrice(booking.total_price)}
                      </div>
                    </div>
                    {(() => {
                      const alreadyReviewed = reviews.some((r) => r.booking_id === booking.id);
                      const canReview =
                        booking.status === 'completed' ||
                        (booking.status === 'confirmed' &&
                          booking.payment_status === 'succeeded' &&
                          bookingEndDateTime(booking) < new Date());

                      if (alreadyReviewed) {
                        return (
                          <Badge variant="default" className="gap-1 text-[10px] sm:text-xs">
                            <Star className="h-2.5 w-2.5 sm:h-3 sm:w-3 fill-current" />
                            Reviewed
                          </Badge>
                        );
                      }

                      if (!canReview) {
                        return (
                          <Badge variant="secondary" className="text-[10px] sm:text-xs">
                            Not eligible for review
                          </Badge>
                        );
                      }

                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 sm:h-8 text-xs"
                          onClick={() => navigate(`/review/${booking.id}`)}
                        >
                          <Star className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                          Review
                        </Button>
                      );
                    })()}
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
