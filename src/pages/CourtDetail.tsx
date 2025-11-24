import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useSlotLock } from '@/hooks/useSlotLock';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MapPin, Star, Clock, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function CourtDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isProfileComplete, loading: profileLoading } = useProfileCompletion();
  const [court, setCourt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState('');
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<string[]>([]);
  const [dateBookingStatus, setDateBookingStatus] = useState<{ [key: string]: 'full' | 'partial' | 'available' }>({});
  
  const { isSlotLocked, lockSlot, getCurrentUserLock } = useSlotLock(id || '', selectedDate || null);

  useEffect(() => {
    if (id) {
      fetchCourtDetails();
    }
  }, [id]);

  useEffect(() => {
    if (selectedDate && id) {
      fetchBookedSlots();
      
      // Set up real-time subscription for bookings
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const channel = supabase
        .channel(`court-bookings-${id}-${dateStr}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: `court_id=eq.${id}`
          },
          (payload) => {
            console.log('Booking change detected:', payload);
            // Refresh booked slots when any booking changes
            fetchBookedSlots();
            
            // Show notification for new bookings
            if (payload.eventType === 'INSERT') {
              toast({
                title: 'Slot Just Booked',
                description: 'A slot was just booked by another user. The calendar has been updated.',
              });
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'slot_locks',
            filter: `court_id=eq.${id}`
          },
          (payload) => {
            console.log('Slot lock change detected:', payload);
            fetchBookedSlots();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [selectedDate, id]);

  async function fetchCourtDetails() {
    try {
      const { data, error } = await supabase
        .from('courts')
        .select(`
          *,
          reviews (rating, comment, created_at, profiles (full_name))
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setCourt(data);
    } catch (error: any) {
      toast({
        title: 'Error loading court details',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchBookedSlots() {
    if (!selectedDate) return;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('start_time, end_time')
        .eq('court_id', id)
        .eq('booking_date', dateStr)
        .in('status', ['confirmed', 'pending']);

      const { data: blocked, error: blockedError } = await supabase
        .from('blocked_slots')
        .select('start_time, end_time')
        .eq('court_id', id)
        .eq('date', dateStr);

      if (bookingsError) throw bookingsError;
      if (blockedError) throw blockedError;

      const booked = bookings?.map(b => `${b.start_time}-${b.end_time}`) || [];
      const blockedTimes = blocked?.map(b => `${b.start_time}-${b.end_time}`) || [];
      
      setBookedSlots(booked);
      setBlockedSlots(blockedTimes);
    } catch (error: any) {
      console.error('Error fetching slots:', error);
    }
  }

  // Fetch booking status for calendar dates
  async function fetchDateBookingStatus() {
    if (!id) return;

    try {
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setMonth(today.getMonth() + 2);

      const { data: bookings } = await supabase
        .from('bookings')
        .select('booking_date, start_time, end_time')
        .eq('court_id', id)
        .gte('booking_date', format(today, 'yyyy-MM-dd'))
        .lte('booking_date', format(nextMonth, 'yyyy-MM-dd'))
        .in('status', ['confirmed', 'pending']);

      const { data: blocked } = await supabase
        .from('blocked_slots')
        .select('date, start_time, end_time')
        .eq('court_id', id)
        .gte('date', format(today, 'yyyy-MM-dd'))
        .lte('date', format(nextMonth, 'yyyy-MM-dd'));

      const dateStatus: { [key: string]: 'full' | 'partial' | 'available' } = {};
      const totalSlots = 16; // Total available time slots per day

      // Process bookings
      const bookingsByDate: { [key: string]: number } = {};
      bookings?.forEach(b => {
        const key = b.booking_date;
        bookingsByDate[key] = (bookingsByDate[key] || 0) + 1;
      });

      // Process blocked slots
      blocked?.forEach(b => {
        const key = b.date;
        bookingsByDate[key] = (bookingsByDate[key] || 0) + 1;
      });

      // Determine status for each date
      Object.entries(bookingsByDate).forEach(([date, count]) => {
        if (count >= totalSlots) {
          dateStatus[date] = 'full';
        } else if (count > 0) {
          dateStatus[date] = 'partial';
        } else {
          dateStatus[date] = 'available';
        }
      });

      setDateBookingStatus(dateStatus);
    } catch (error: any) {
      console.error('Error fetching date booking status:', error);
    }
  }

  useEffect(() => {
    if (id) {
      fetchDateBookingStatus();
    }
  }, [id]);

  const timeSlots = [
    '06:00-07:00', '07:00-08:00', '08:00-09:00', '09:00-10:00',
    '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00',
    '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00',
    '18:00-19:00', '19:00-20:00', '20:00-21:00', '21:00-22:00',
  ];

  const isSlotAvailable = (slot: string) => {
    const [startTime, endTime] = slot.split('-');
    return !bookedSlots.includes(slot) && 
           !blockedSlots.includes(slot) && 
           !isSlotLocked(startTime, endTime);
  };

  const getSlotStatus = (slot: string) => {
    const [startTime, endTime] = slot.split('-');
    if (bookedSlots.includes(slot)) return { status: 'booked', label: 'Booked', color: 'destructive' };
    if (blockedSlots.includes(slot)) return { status: 'blocked', label: 'Blocked', color: 'secondary' };
    if (isSlotLocked(startTime, endTime)) return { status: 'locked', label: 'Reserved', color: 'outline' };
    return { status: 'available', label: 'Available', color: 'default' };
  };

  const handleBooking = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to book a court',
        variant: 'destructive',
      });
      navigate('/auth');
      return;
    }

    // Check if profile is complete
    if (isProfileComplete === false) {
      toast({
        title: 'Complete your profile',
        description: 'Please complete your profile before booking',
      });
      navigate(`/complete-profile?return=/courts/${id}`);
      return;
    }

    if (!selectedDate || !selectedTime) {
      toast({
        title: 'Missing information',
        description: 'Please select both date and time',
        variant: 'destructive',
      });
      return;
    }

    setBookingLoading(true);

    try {
      const [startTime, endTime] = selectedTime.split('-');
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Double-check slot availability before locking
      const { data: existingBookings, error: checkError } = await supabase
        .from('bookings')
        .select('id')
        .eq('court_id', id)
        .eq('booking_date', dateStr)
        .eq('start_time', startTime)
        .eq('end_time', endTime)
        .in('status', ['confirmed', 'pending']);

      if (checkError) throw checkError;

      if (existingBookings && existingBookings.length > 0) {
        toast({
          title: 'Slot Unavailable',
          description: 'This slot was just booked by another user. Please select a different time.',
          variant: 'destructive',
        });
        // Refresh slots to show updated availability
        await fetchBookedSlots();
        return;
      }
      
      // Check if slot is already locked by current user
      const existingLock = getCurrentUserLock(startTime, endTime);
      
      if (!existingLock) {
        // Create a new slot lock
        const lock = await lockSlot(startTime, endTime);
        
        if (!lock) {
          toast({
            title: 'Slot Unavailable',
            description: 'This time slot is currently being reserved by another user. Please try again in a moment or select a different time.',
            variant: 'destructive',
          });
          await fetchBookedSlots();
          return;
        }

        toast({
          title: '🎉 Slot Reserved!',
          description: 'You have 5 minutes to complete your booking',
        });
      }

      // Navigate to booking page
      navigate(`/book/${id}`, {
        state: {
          court,
          date: selectedDate,
          timeSlot: selectedTime,
          lockId: existingLock?.id,
        },
      });
    } catch (error: any) {
      toast({
        title: 'Booking Error',
        description: error.message || 'Unable to reserve slot. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!court) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <p>Court not found</p>
        </div>
      </div>
    );
  }

  const avgRating = court.reviews?.length > 0
    ? court.reviews.reduce((a: number, r: any) => a + r.rating, 0) / court.reviews.length
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-6 aspect-video w-full overflow-hidden rounded-lg bg-muted">
              {court.images && court.images.length > 0 ? (
                <img
                  src={court.images[0]}
                  alt={court.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No image available
                </div>
              )}
            </div>

            <h1 className="mb-2 text-3xl font-bold">{court.name}</h1>
            
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <Badge variant="secondary">{court.sport_type}</Badge>
              <div className="flex items-center text-sm text-muted-foreground">
                <MapPin className="mr-1 h-4 w-4" />
                {court.address}, {court.city}, {court.state}
              </div>
              {avgRating > 0 && (
                <div className="flex items-center">
                  <Star className="mr-1 h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium">{avgRating.toFixed(1)}</span>
                  <span className="ml-1 text-sm text-muted-foreground">
                    ({court.reviews?.length} reviews)
                  </span>
                </div>
              )}
            </div>

            <p className="mb-6 text-muted-foreground">{court.description}</p>

            {court.amenities && court.amenities.length > 0 && (
              <div className="mb-6">
                <h2 className="mb-2 text-xl font-semibold">Amenities</h2>
                <div className="flex flex-wrap gap-2">
                  {court.amenities.map((amenity: string, index: number) => (
                    <Badge key={index} variant="outline">{amenity}</Badge>
                  ))}
                </div>
              </div>
            )}

            {court.reviews && court.reviews.length > 0 && (
              <div>
                <h2 className="mb-4 text-xl font-semibold">Reviews</h2>
                <div className="space-y-4">
                  {court.reviews.map((review: any, index: number) => (
                    <Card key={index}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{review.profiles?.full_name || 'Anonymous'}</CardTitle>
                          <div className="flex items-center">
                            <Star className="mr-1 h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span>{review.rating}</span>
                          </div>
                        </div>
                        <CardDescription>
                          {format(new Date(review.created_at), 'MMM d, yyyy')}
                        </CardDescription>
                      </CardHeader>
                      {review.comment && (
                        <CardContent>
                          <p className="text-sm">{review.comment}</p>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle>Book This Court</CardTitle>
                <CardDescription className="text-2xl font-bold text-foreground">
                  ${court.base_price}/hour
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Select Date</label>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    className="rounded-md border"
                    modifiers={{
                      fullyBooked: (date) => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        return dateBookingStatus[dateStr] === 'full';
                      },
                      partiallyBooked: (date) => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        return dateBookingStatus[dateStr] === 'partial';
                      },
                    }}
                    modifiersClassNames={{
                      fullyBooked: 'bg-destructive/20 text-destructive font-bold',
                      partiallyBooked: 'bg-yellow-500/20 text-yellow-700 font-medium',
                    }}
                  />
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <div className="h-3 w-3 rounded-sm bg-destructive/20 border border-destructive" />
                      <span>Fully Booked</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="h-3 w-3 rounded-sm bg-yellow-500/20 border border-yellow-500" />
                      <span>Partially Booked</span>
                    </div>
                  </div>
                </div>

                {selectedDate && (
                  <div>
                    <label className="mb-2 block text-sm font-medium">Select Time</label>
                    
                    {/* Legend */}
                    <div className="mb-3 flex flex-wrap gap-2 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-3 rounded-full bg-primary/20 border border-primary" />
                        <span>Available</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-3 rounded-full bg-destructive/20 border border-destructive" />
                        <span>Booked</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-3 w-3 rounded-full bg-muted border border-border" />
                        <span>Reserved</span>
                      </div>
                    </div>

                    <Select value={selectedTime} onValueChange={setSelectedTime}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a time slot">
                          {selectedTime && (
                            <div className="flex items-center">
                              <Clock className="mr-2 h-4 w-4" />
                              {selectedTime}
                            </div>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {timeSlots.filter(slot => isSlotAvailable(slot)).map((slot) => {
                          return (
                            <SelectItem
                              key={slot}
                              value={slot}
                              className="cursor-pointer"
                            >
                              <div className="flex items-center justify-between w-full gap-3">
                                <span>{slot}</span>
                                <Badge 
                                  variant="outline"
                                  className="bg-primary/10 text-primary border-primary"
                                >
                                  Available
                                </Badge>
                              </div>
                            </SelectItem>
                          );
                        })}
                        {timeSlots.filter(slot => !isSlotAvailable(slot)).length === timeSlots.length && (
                          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                            No available slots for this date
                          </div>
                        )}
                      </SelectContent>
                    </Select>

                    {/* Show slot counts */}
                    <div className="mt-3 text-xs text-muted-foreground">
                      {bookedSlots.length + blockedSlots.length > 0 && (
                        <p>{bookedSlots.length} slot{bookedSlots.length !== 1 ? 's' : ''} booked • {timeSlots.length - bookedSlots.length - blockedSlots.length} available</p>
                      )}
                    </div>
                  </div>
                )}

                <Button
                  className="w-full text-lg py-6"
                  size="lg"
                  onClick={handleBooking}
                  disabled={!selectedDate || !selectedTime || bookingLoading}
                >
                  {bookingLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reserving slot...
                    </>
                  ) : !selectedDate || !selectedTime ? (
                    'Select Date & Time'
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Reserve & Continue
                    </>
                  )}
                </Button>
                {selectedDate && selectedTime && (
                  <p className="text-sm text-muted-foreground text-center">
                    Slot will be reserved for 5 minutes
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
