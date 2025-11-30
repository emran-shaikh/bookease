import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useSlotLock } from '@/hooks/useSlotLock';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, MapPin, Star, Clock, Lock, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, addDays, startOfDay } from 'date-fns';
import { useFavorites } from '@/hooks/useFavorites';

export default function CourtDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [court, setCourt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedStartTime, setSelectedStartTime] = useState('');
  const [selectedHours, setSelectedHours] = useState(1);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<string[]>([]);
  const [dateBookingStatus, setDateBookingStatus] = useState<{ [key: string]: 'full' | 'partial' | 'available' }>({});
  const [slotPricing, setSlotPricing] = useState<{ [key: string]: { price: number; multiplier: number; rules: string[] } }>({});
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [totalPrice, setTotalPrice] = useState<number | null>(null);
  const { toggleFavorite, isFavorite } = useFavorites(user?.id);
  
  const { isSlotLocked, lockSlot, getCurrentUserLock } = useSlotLock(id || '', selectedDate || null);

  useEffect(() => {
    if (id) {
      fetchCourtDetails();
    }
  }, [id]);

  useEffect(() => {
    if (selectedDate && id) {
      fetchBookedSlots();
      fetchSlotPricing();
      
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
            fetchBookedSlots();
            
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

  // Calculate total price when time/hours change
  useEffect(() => {
    if (selectedStartTime && selectedHours && selectedDate && id) {
      calculateTotalPrice();
    }
  }, [selectedStartTime, selectedHours, selectedDate, id]);

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

  async function fetchSlotPricing() {
    if (!selectedDate || !id) return;

    setLoadingPricing(true);
    const pricing: { [key: string]: { price: number; multiplier: number; rules: string[] } } = {};

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      const pricingPromises = timeSlots.map(async (slot) => {
        const [startTime, endTime] = slot.split('-').map(t => t.trim());
        
        try {
          const response = await supabase.functions.invoke('calculate-price', {
            body: {
              courtId: id,
              date: dateStr,
              startTime,
              endTime,
            },
          });

          if (!response.error && response.data) {
            pricing[slot] = {
              price: parseFloat(response.data.finalPrice),
              multiplier: response.data.priceMultiplier,
              rules: response.data.appliedRules || []
            };
          }
        } catch (error) {
          console.error(`Error fetching price for slot ${slot}:`, error);
        }
      });

      await Promise.all(pricingPromises);
      setSlotPricing(pricing);
    } catch (error: any) {
      console.error('Error fetching slot pricing:', error);
    } finally {
      setLoadingPricing(false);
    }
  }

  async function calculateTotalPrice() {
    if (!selectedDate || !selectedStartTime || !id || selectedHours < 1) {
      setTotalPrice(null);
      return;
    }

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const endTime = addHoursToTime(selectedStartTime, selectedHours);

      const response = await supabase.functions.invoke('calculate-price', {
        body: {
          courtId: id,
          date: dateStr,
          startTime: selectedStartTime,
          endTime: endTime,
        },
      });

      if (!response.error && response.data) {
        setTotalPrice(parseFloat(response.data.finalPrice));
      }
    } catch (error) {
      console.error('Error calculating total price:', error);
      setTotalPrice(null);
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
      const totalSlots = 16;

      const bookingsByDate: { [key: string]: number } = {};
      bookings?.forEach(b => {
        const key = b.booking_date;
        bookingsByDate[key] = (bookingsByDate[key] || 0) + 1;
      });

      blocked?.forEach(b => {
        const key = b.date;
        bookingsByDate[key] = (bookingsByDate[key] || 0) + 1;
      });

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
    '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
    '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
  ];

  const convertTo12Hour = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const addHoursToTime = (time: string, hours: number) => {
    const [h, m] = time.split(':').map(Number);
    const newHours = (h + hours) % 24;
    return `${newHours.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const isSlotAvailable = (startTime: string) => {
    const endTime = addHoursToTime(startTime, selectedHours);
    
    // Check if end time is within operating hours
    const endHour = parseInt(endTime.split(':')[0]);
    if (endHour > 22) return false;
    
    // Check if any slot in the range is booked or blocked
    for (let i = 0; i < selectedHours; i++) {
      const checkStart = addHoursToTime(startTime, i);
      const checkEnd = addHoursToTime(startTime, i + 1);
      const slotKey = `${checkStart}-${checkEnd}`;
      
      if (bookedSlots.includes(slotKey) || blockedSlots.includes(slotKey)) {
        return false;
      }
      
      if (isSlotLocked(checkStart, checkEnd)) {
        return false;
      }
    }
    
    return true;
  };

  const getPriceLevel = (multiplier: number) => {
    if (multiplier === 1) return { level: 'standard', label: '💵 Standard', color: 'bg-green-500/10 text-green-700 border-green-500' };
    if (multiplier <= 1.3) return { level: 'moderate', label: '💰 Moderate', color: 'bg-blue-500/10 text-blue-700 border-blue-500' };
    if (multiplier <= 1.7) return { level: 'peak', label: '🔥 Peak', color: 'bg-amber-500/10 text-amber-700 border-amber-500' };
    return { level: 'premium', label: '⭐ Premium', color: 'bg-red-500/10 text-red-700 border-red-500' };
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

    if (!selectedDate || !selectedStartTime) {
      toast({
        title: 'Missing information',
        description: 'Please select date and start time',
        variant: 'destructive',
      });
      return;
    }

    setBookingLoading(true);

    try {
      const endTime = addHoursToTime(selectedStartTime, selectedHours);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Check all slots in range
      for (let i = 0; i < selectedHours; i++) {
        const checkStart = addHoursToTime(selectedStartTime, i);
        const checkEnd = addHoursToTime(selectedStartTime, i + 1);
        
        const { data: existingBookings, error: checkError } = await supabase
          .from('bookings')
          .select('id')
          .eq('court_id', id)
          .eq('booking_date', dateStr)
          .eq('start_time', checkStart)
          .eq('end_time', checkEnd)
          .in('status', ['confirmed', 'pending']);

        if (checkError) throw checkError;

        if (existingBookings && existingBookings.length > 0) {
          toast({
            title: 'Slot Unavailable',
            description: 'One or more slots in your selection were just booked. Please choose different times.',
            variant: 'destructive',
          });
          await fetchBookedSlots();
          return;
        }
      }
      
      const existingLock = getCurrentUserLock(selectedStartTime, endTime);
      
      if (!existingLock) {
        const lock = await lockSlot(selectedStartTime, endTime);
        
        if (!lock) {
          toast({
            title: 'Slot Unavailable',
            description: 'This time slot is currently being reserved. Please try again in a moment.',
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

      navigate(`/book/${id}`, {
        state: {
          court,
          date: selectedDate,
          timeSlot: `${selectedStartTime}-${endTime}`,
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

  const getSlotStatus = (time: string) => {
    const hour = parseInt(time.split(':')[0]);
    if (hour + selectedHours > 22) return { available: false, reason: 'Outside hours' };
    
    const available = isSlotAvailable(time);
    if (!available) {
      // Check if it's booked or blocked
      for (let i = 0; i < selectedHours; i++) {
        const checkStart = addHoursToTime(time, i);
        const checkEnd = addHoursToTime(time, i + 1);
        const slotKey = `${checkStart}-${checkEnd}`;
        
        if (bookedSlots.includes(slotKey)) {
          return { available: false, reason: 'Booked' };
        }
        if (blockedSlots.includes(slotKey)) {
          return { available: false, reason: 'Unavailable' };
        }
        if (isSlotLocked(checkStart, checkEnd)) {
          return { available: false, reason: 'Being reserved' };
        }
      }
    }
    
    return { available: true, reason: '' };
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-6 aspect-video w-full overflow-hidden rounded-lg bg-muted relative">
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
              {user && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-4 bg-background/80 hover:bg-background"
                  onClick={() => toggleFavorite(court.id)}
                >
                  <Heart
                    className={`h-6 w-6 ${
                      isFavorite(court.id) ? 'fill-red-500 text-red-500' : 'text-foreground'
                    }`}
                  />
                </Button>
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
                <h2 className="mb-4 text-xl font-semibold">Customer Reviews ({court.reviews.length})</h2>
                <div className="space-y-4">
                  {court.reviews.map((review: any, index: number) => (
                    <Card key={index}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{review.profiles?.full_name || 'Anonymous'}</CardTitle>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-4 w-4 ${
                                  star <= review.rating
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <CardDescription>
                          {format(new Date(review.created_at), 'MMM d, yyyy')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {review.comment && (
                          <p className="text-sm leading-relaxed">{review.comment}</p>
                        )}
                        {review.images && review.images.length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {review.images.map((imageUrl: string, imgIndex: number) => (
                              <img
                                key={imgIndex}
                                src={imageUrl}
                                alt={`Review photo ${imgIndex + 1}`}
                                className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(imageUrl, '_blank')}
                              />
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-20 overflow-hidden">
              <CardHeader className="bg-gradient-to-br from-primary/5 to-secondary/5 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">Book Your Slot</CardTitle>
                    <CardDescription className="text-lg font-semibold text-primary mt-1">
                      ${court.base_price}/hour base rate
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                {/* Horizontal Date Selector */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-center">Select a date</h3>
                  <div className="relative">
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-10 w-10 rounded-full"
                        onClick={() => {
                          const firstDate = startOfDay(new Date());
                          setSelectedDate(firstDate);
                        }}
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      
                      <div className="flex-1 overflow-x-auto hide-scrollbar">
                        <div className="flex gap-2 min-w-max px-1">
                          {Array.from({ length: 14 }).map((_, index) => {
                            const date = addDays(startOfDay(new Date()), index);
                            const dateStr = format(date, 'yyyy-MM-dd');
                            const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === dateStr;
                            const status = dateBookingStatus[dateStr];
                            
                            return (
                              <button
                                key={dateStr}
                                onClick={() => setSelectedDate(date)}
                                className={`flex flex-col items-center justify-center min-w-[70px] p-3 rounded-xl border-2 transition-all ${
                                  isSelected
                                    ? 'bg-primary text-primary-foreground border-primary shadow-lg scale-105'
                                    : 'bg-card hover:bg-muted border-border hover:border-primary/50'
                                }`}
                              >
                                <div className={`text-xs font-medium mb-1 ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`}>
                                  {format(date, 'EEE')}
                                </div>
                                <div className={`text-2xl font-bold ${isSelected ? 'text-primary-foreground' : 'text-foreground'}`}>
                                  {format(date, 'd')}
                                </div>
                                <div className={`text-xs ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                  {format(date, 'MMM')}
                                </div>
                                {status && !isSelected && (
                                  <div className="mt-1">
                                    <div className={`h-1.5 w-1.5 rounded-full ${
                                      status === 'full' ? 'bg-destructive' : 'bg-warning'
                                    }`} />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-10 w-10 rounded-full"
                        onClick={() => {
                          const lastDate = addDays(startOfDay(new Date()), 13);
                          setSelectedDate(lastDate);
                        }}
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {selectedDate && (
                  <>
                    {/* Duration Selector */}
                    <div>
                      <h3 className="text-sm font-medium mb-3">Duration</h3>
                      <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((hours) => (
                          <Button
                            key={hours}
                            variant={selectedHours === hours ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedHours(hours)}
                            className={`h-11 font-semibold transition-all ${
                              selectedHours === hours ? 'shadow-md' : ''
                            }`}
                          >
                            {hours}h
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Time Slots Grid */}
                    <div>
                      <h3 className="text-sm font-medium mb-3">Select a time slot</h3>
                      
                      {loadingPricing ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                          <span className="text-sm text-muted-foreground">Loading available times...</span>
                        </div>
                      ) : (
                        <>
                          <div className="max-h-[320px] overflow-y-auto pr-2 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              {timeSlots.map((time) => {
                                const hour = parseInt(time.split(':')[0]);
                                if (hour + selectedHours > 22) return null;
                                
                                const endTime = addHoursToTime(time, selectedHours);
                                const slotKey = `${time}-${addHoursToTime(time, 1)}`;
                                const pricing = slotPricing[slotKey];
                                const slotStatus = getSlotStatus(time);
                                const isSelected = selectedStartTime === time;
                                
                                return (
                                  <button
                                    key={time}
                                    onClick={() => slotStatus.available && setSelectedStartTime(time)}
                                    disabled={!slotStatus.available}
                                    className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                                      isSelected
                                        ? 'bg-primary text-primary-foreground border-primary shadow-lg scale-[1.02]'
                                        : slotStatus.available
                                        ? 'bg-card border-border hover:border-primary/50 hover:bg-muted/50'
                                        : 'bg-muted/30 border-muted cursor-not-allowed opacity-60'
                                    }`}
                                  >
                                    <div className={`text-base font-bold mb-1 ${
                                      isSelected ? 'text-primary-foreground' : slotStatus.available ? 'text-primary' : 'text-muted-foreground'
                                    }`}>
                                      {convertTo12Hour(time)}
                                    </div>
                                    {slotStatus.available ? (
                                      <div className={`text-xs ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                        {selectedHours}h • {pricing ? `$${pricing.price}/hr` : '...'}
                                      </div>
                                    ) : (
                                      <div className="text-xs text-destructive font-medium">
                                        {slotStatus.reason}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {selectedStartTime && totalPrice !== null && (
                            <div className="mt-4 p-4 bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary/20 rounded-xl">
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="text-sm text-muted-foreground mb-1">Total Price</div>
                                  <div className="text-xs text-muted-foreground">
                                    {convertTo12Hour(selectedStartTime)} - {convertTo12Hour(addHoursToTime(selectedStartTime, selectedHours))}
                                  </div>
                                </div>
                                <div className="text-3xl font-bold text-primary">
                                  ${totalPrice.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}

                <Button
                  className="w-full text-base py-6 shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                  onClick={handleBooking}
                  disabled={!selectedDate || !selectedStartTime || bookingLoading || loadingPricing}
                >
                  {bookingLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Reserving slot...
                    </>
                  ) : !selectedDate || !selectedStartTime ? (
                    'Select Date & Time'
                  ) : (
                    <>
                      <Lock className="mr-2 h-5 w-5" />
                      Reserve & Continue to Payment
                    </>
                  )}
                </Button>
                {selectedDate && selectedStartTime && (
                  <p className="text-xs text-muted-foreground text-center">
                    🔒 Slot will be reserved for 5 minutes
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
