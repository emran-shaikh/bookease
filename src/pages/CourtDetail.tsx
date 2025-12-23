import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useSlotLock } from '@/hooks/useSlotLock';
import { useIsMobile } from '@/hooks/use-mobile';
import { Header } from '@/components/Header';
import { SEO } from '@/components/SEO';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '@/components/ui/carousel';
import { Loader2, MapPin, Star, Clock, Lock, Heart, ChevronLeft, ChevronRight, Filter, CalendarIcon, List } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, addDays, startOfDay, isBefore, isToday } from 'date-fns';
import { useFavorites } from '@/hooks/useFavorites';
import { formatPrice } from '@/lib/currency';

export default function CourtDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [court, setCourt] = useState<any>(null);
  const [courtId, setCourtId] = useState<string | null>(null);
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
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const [totalPrice, setTotalPrice] = useState<number | null>(null);
  const [priceBreakdown, setPriceBreakdown] = useState<{
    basePrice: number;
    hourlyBreakdown: Array<{
      hour: number;
      startTime: string;
      endTime: string;
      multiplier: number;
      hourPrice: number;
      rules: string[];
      isNextDay: boolean;
    }>;
    summary: {
      normalHours: number;
      normalTotal: number;
      peakHours: number;
      peakTotal: number;
      appliedRules: string[];
    };
  } | null>(null);
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'scroll' | 'calendar'>(() => (isMobile ? 'calendar' : 'scroll'));
  const { toggleFavorite, isFavorite } = useFavorites(user?.id);
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  
  const { isSlotLocked, lockSlot, getCurrentUserLock } = useSlotLock(courtId || '', selectedDate || null);

  useEffect(() => {
    // On mobile we only show the calendar view (no horizontal date list)
    if (isMobile && viewMode !== 'calendar') {
      setViewMode('calendar');
    }
  }, [isMobile, viewMode]);

  useEffect(() => {
    if (slug) {
      fetchCourtDetails();
    }
  }, [slug]);

  useEffect(() => {
    if (selectedDate && courtId) {
      fetchBookedSlots();
      fetchSlotPricing();
      
      // Set up real-time subscription for bookings
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const channel = supabase
        .channel(`court-bookings-${courtId}-${dateStr}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: `court_id=eq.${courtId}`
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
            filter: `court_id=eq.${courtId}`
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
  }, [selectedDate, courtId]);

  // Calculate total price when time/hours change
  useEffect(() => {
    if (selectedStartTime && selectedHours && selectedDate && courtId) {
      calculateTotalPrice();
    }
  }, [selectedStartTime, selectedHours, selectedDate, courtId]);

  async function fetchCourtDetails() {
    try {
      const { data, error } = await supabase
        .from('courts')
        .select(`
          *,
          reviews (rating, comment, created_at, profiles (full_name))
        `)
        .eq('slug', slug)
        .single();

      if (error) throw error;
      setCourt(data);
      setCourtId(data.id);
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

  // Helper to normalize time to HH:MM format (strips seconds if present)
  const normalizeTime = (time: string): string => {
    const parts = time.split(':');
    return `${parts[0]}:${parts[1]}`;
  };

  async function fetchBookedSlots() {
    if (!selectedDate || !courtId) return;

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Batch both queries for better performance
      const [bookingsResult, blockedResult] = await Promise.all([
        supabase
          .from('bookings')
          .select('start_time, end_time')
          .eq('court_id', courtId)
          .eq('booking_date', dateStr)
          .in('status', ['confirmed', 'pending']),
        supabase
          .from('blocked_slots')
          .select('start_time, end_time')
          .eq('court_id', courtId)
          .eq('date', dateStr)
      ]);

      if (bookingsResult.error) throw bookingsResult.error;
      if (blockedResult.error) throw blockedResult.error;

      // Normalize time format to HH:MM (database stores HH:MM:SS)
      const booked = bookingsResult.data?.map(b => 
        `${normalizeTime(b.start_time)}-${normalizeTime(b.end_time)}`
      ) || [];
      const blockedTimes = blockedResult.data?.map(b => 
        `${normalizeTime(b.start_time)}-${normalizeTime(b.end_time)}`
      ) || [];
      
      console.log('Booked slots:', booked);
      console.log('Blocked slots:', blockedTimes);
      
      setBookedSlots(booked);
      setBlockedSlots(blockedTimes);
    } catch (error: any) {
      console.error('Error fetching slots:', error);
    }
  }

  async function fetchSlotPricing() {
    if (!selectedDate || !courtId || !court) return;

    setLoadingPricing(true);
    const pricing: { [key: string]: { price: number; multiplier: number; rules: string[] } } = {};

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const dayOfWeek = selectedDate.getDay();
      const basePrice = parseFloat(court.base_price) || 0;

      // Fetch pricing rules and holidays in parallel (once for all slots)
      const [rulesResult, holidayResult] = await Promise.all([
        supabase
          .from('pricing_rules')
          .select('*')
          .eq('court_id', courtId)
          .eq('is_active', true),
        supabase
          .from('holidays')
          .select('*')
          .eq('date', dateStr)
          .eq('is_active', true)
          .maybeSingle()
      ]);

      const pricingRules = rulesResult.data || [];
      const holiday = holidayResult.data;

      // Calculate price for each slot locally
      timeSlots.forEach((startTime) => {
        const endTime = addHoursToTime(startTime, 1);
        const slotKey = `${startTime}-${endTime}`;
        
        let priceMultiplier = 1.0;
        const appliedRules: string[] = [];

        // Apply pricing rules
        for (const rule of pricingRules) {
          if (rule.rule_type === 'peak_hours') {
            const ruleStart = rule.start_time;
            const ruleEnd = rule.end_time;
            
            if (ruleStart && ruleEnd && startTime >= ruleStart && endTime <= ruleEnd) {
              if (rule.days_of_week && rule.days_of_week.includes(dayOfWeek)) {
                priceMultiplier = Math.max(priceMultiplier, Number(rule.price_multiplier));
                appliedRules.push(`Peak Hours (${rule.price_multiplier}x)`);
              }
            }
          } else if (rule.rule_type === 'weekend') {
            if (dayOfWeek === 0 || dayOfWeek === 6) {
              priceMultiplier = Math.max(priceMultiplier, Number(rule.price_multiplier));
              appliedRules.push(`Weekend (${rule.price_multiplier}x)`);
            }
          } else if (rule.rule_type === 'custom') {
            if (rule.days_of_week && rule.days_of_week.includes(dayOfWeek)) {
              priceMultiplier = Math.max(priceMultiplier, Number(rule.price_multiplier));
              appliedRules.push(`Custom (${rule.price_multiplier}x)`);
            }
          }
        }

        // Apply holiday pricing
        if (holiday) {
          priceMultiplier = Math.max(priceMultiplier, Number(holiday.price_multiplier));
          appliedRules.push(`Holiday: ${holiday.name} (${holiday.price_multiplier}x)`);
        }

        pricing[slotKey] = {
          price: basePrice * priceMultiplier,
          multiplier: priceMultiplier,
          rules: appliedRules
        };
      });

      setSlotPricing(pricing);
    } catch (error: any) {
      console.error('Error fetching slot pricing:', error);
    } finally {
      setLoadingPricing(false);
    }
  }

  async function calculateTotalPrice() {
    if (!selectedDate || !selectedStartTime || !courtId || selectedHours < 1) {
      setTotalPrice(null);
      setPriceBreakdown(null);
      return;
    }

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const endTime = addHoursToTime(selectedStartTime, selectedHours);

      const response = await supabase.functions.invoke('calculate-price', {
        body: {
          courtId: courtId,
          date: dateStr,
          startTime: selectedStartTime,
          endTime: endTime,
        },
      });

      if (!response.error && response.data) {
        const total = parseFloat(response.data.totalPrice);
        setTotalPrice(isNaN(total) ? null : total);
        setPriceBreakdown({
          basePrice: parseFloat(response.data.basePrice) || court?.base_price || 0,
          hourlyBreakdown: response.data.hourlyBreakdown || [],
          summary: response.data.summary || {
            normalHours: 0,
            normalTotal: 0,
            peakHours: 0,
            peakTotal: 0,
            appliedRules: []
          }
        });
      }
    } catch (error) {
      console.error('Error calculating total price:', error);
      setTotalPrice(null);
      setPriceBreakdown(null);
    }
  }

  // Fetch booking status for calendar dates
  async function fetchDateBookingStatus() {
    if (!courtId) return;

    try {
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setMonth(today.getMonth() + 2);

      const todayStr = format(today, 'yyyy-MM-dd');
      const nextMonthStr = format(nextMonth, 'yyyy-MM-dd');

      // Batch both queries for better performance
      const [bookingsResult, blockedResult] = await Promise.all([
        supabase
          .from('bookings')
          .select('booking_date')
          .eq('court_id', courtId)
          .gte('booking_date', todayStr)
          .lte('booking_date', nextMonthStr)
          .in('status', ['confirmed', 'pending']),
        supabase
          .from('blocked_slots')
          .select('date')
          .eq('court_id', courtId)
          .gte('date', todayStr)
          .lte('date', nextMonthStr)
      ]);

      const dateStatus: { [key: string]: 'full' | 'partial' | 'available' } = {};
      const openingHour = court?.opening_time ? parseInt(court.opening_time.split(':')[0]) : 0;
      const closingHour = court?.closing_time ? parseInt(court.closing_time.split(':')[0]) : 23;
      const totalSlots = closingHour - openingHour + 1; // +1 because closing hour is inclusive

      const bookingsByDate: { [key: string]: number } = {};
      bookingsResult.data?.forEach(b => {
        const key = b.booking_date;
        bookingsByDate[key] = (bookingsByDate[key] || 0) + 1;
      });

      blockedResult.data?.forEach(b => {
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
    if (courtId) {
      fetchDateBookingStatus();
    }
  }, [courtId]);

  // Helper function to parse time string (handles both HH:MM and HH:MM:SS formats)
  const parseTimeHour = (timeStr: string | null | undefined, defaultHour: number): number => {
    if (!timeStr) return defaultHour;
    return parseInt(timeStr.split(':')[0]) || defaultHour;
  };

  // Check if court operates 24 hours (opening at 00:00 and closing at 23:00/23:59 or later)
  const is24HourCourt = (): boolean => {
    const opening = parseTimeHour(court?.opening_time, 0);
    const closing = parseTimeHour(court?.closing_time, 23);
    return opening === 0 && closing >= 23;
  };

  // Generate time slots based on court's opening/closing hours
  // Last bookable slot is the closing hour (e.g., 23:00 slot if closing at 23:00)
  const generateTimeSlots = () => {
    const openingHour = parseTimeHour(court?.opening_time, 0);
    const closingHour = parseTimeHour(court?.closing_time, 23);
    const slots: string[] = [];
    
    // Generate slots from opening to closing (inclusive)
    // For 24-hour courts (00:00 - 23:00), this creates 24 slots
    for (let hour = openingHour; hour <= closingHour; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    return slots;
  };
  
  const timeSlots = generateTimeSlots();

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

  // Check if end time is past midnight (overnight booking)
  const isOvernightBooking = (startTime: string, hours: number) => {
    const startHour = parseInt(startTime.split(':')[0]);
    return startHour + hours > 24;
  };

  // Get the end time with indication if it's next day
  const getEndTimeWithContext = (startTime: string, hours: number) => {
    const endTime = addHoursToTime(startTime, hours);
    const isOvernight = isOvernightBooking(startTime, hours);
    return { endTime, isOvernight };
  };

  const isSlotAvailable = (startTime: string) => {
    const { endTime, isOvernight } = getEndTimeWithContext(startTime, selectedHours);
    
    const closingHour = parseTimeHour(court?.closing_time, 23);
    const startHour = parseInt(startTime.split(':')[0]);
    const is24Hours = is24HourCourt();
    
    // For 24h courts, allow overnight bookings (e.g., 23:00 - 01:00)
    // For non-24h courts, check if booking exceeds operating hours
    if (!is24Hours) {
      const endHour = parseInt(endTime.split(':')[0]);
      // If booking ends after closing and it's not an overnight wrap
      if (!isOvernight && endHour > closingHour + 1) return false;
    }
    
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
          .eq('court_id', courtId)
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

      navigate(`/book/${slug}`, {
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
      <div className="flex min-h-screen items-center justify-center bg-background">
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
    const closingHour = parseTimeHour(court?.closing_time, 23);
    const is24Hours = is24HourCourt();
    
    // For non-24h courts, hide slots that would extend beyond closing
    // For 24h courts, allow overnight bookings
    if (!is24Hours && selectedHours > 1) {
      const endHour = (hour + selectedHours) % 24;
      // If booking would exceed closing and doesn't wrap overnight
      if (hour + selectedHours > closingHour + 1 && hour < closingHour) {
        return { available: false, reason: 'Outside hours', hide: true };
      }
    }
    
    // Check if slot is in the past (for today)
    if (selectedDate && isToday(selectedDate)) {
      const now = new Date();
      const slotTime = new Date(selectedDate);
      slotTime.setHours(hour, 0, 0, 0);
      if (slotTime <= now) {
        return { available: false, reason: 'Past', hide: true };
      }
    }
    
    const available = isSlotAvailable(time);
    if (!available) {
      // Check if it's booked or blocked
      for (let i = 0; i < selectedHours; i++) {
        const checkStart = addHoursToTime(time, i);
        const checkEnd = addHoursToTime(time, i + 1);
        const slotKey = `${checkStart}-${checkEnd}`;
        
        if (bookedSlots.includes(slotKey)) {
          return { available: false, reason: 'Booked', hide: true };
        }
        if (blockedSlots.includes(slotKey)) {
          return { available: false, reason: 'Unavailable', hide: true };
        }
        if (isSlotLocked(checkStart, checkEnd)) {
          return { available: false, reason: 'Being reserved', hide: false };
        }
      }
    }
    
    return { available: true, reason: '', hide: false };
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SEO 
        title={court ? `${court.name} - Book Now` : 'Court Details'}
        description={court ? `Book ${court.name} in ${court.city}. ${court.sport_type} court with real-time availability. ${court.description?.slice(0, 100) || ''}` : 'View court details and book your slot.'}
        keywords={court ? `${court.name}, ${court.sport_type}, ${court.city}, book court, sports venue` : 'court details, sports booking'}
      />
      <Header />
      
      <main className="container py-4 sm:py-6 md:py-8 px-4 overflow-x-hidden">
        <div className="grid gap-4 sm:gap-6 md:gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-4 sm:mb-6 relative">
              {court.images && court.images.length > 1 ? (
                <Carousel className="w-full">
                  <CarouselContent>
                    {court.images.map((image: string, index: number) => (
                      <CarouselItem key={index}>
                        <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
                          <img
                            src={image}
                            alt={`${court.name} - Image ${index + 1}`}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              const parent = (e.target as HTMLImageElement).parentElement;
                              if (parent && !parent.querySelector('.fallback-text')) {
                                parent.classList.add('flex', 'items-center', 'justify-center');
                                const fallback = document.createElement('span');
                                fallback.className = 'fallback-text text-muted-foreground';
                                fallback.textContent = 'Image unavailable';
                                parent.appendChild(fallback);
                              }
                            }}
                          />
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="left-2 h-8 w-8 sm:h-10 sm:w-10 bg-background/80 hover:bg-background border-0" />
                  <CarouselNext className="right-2 h-8 w-8 sm:h-10 sm:w-10 bg-background/80 hover:bg-background border-0" />
                </Carousel>
              ) : court.images && court.images.length === 1 ? (
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
                  <img
                    src={court.images[0]}
                    alt={court.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const parent = (e.target as HTMLImageElement).parentElement;
                      if (parent && !parent.querySelector('.fallback-text')) {
                        parent.classList.add('flex', 'items-center', 'justify-center');
                        const fallback = document.createElement('span');
                        fallback.className = 'fallback-text text-muted-foreground';
                        fallback.textContent = 'Image unavailable';
                        parent.appendChild(fallback);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  No image available
                </div>
              )}
              {user && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 right-4 z-10 bg-background/80 hover:bg-background"
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

            <h1 className="mb-2 text-xl sm:text-2xl md:text-3xl font-bold">{court.name}</h1>
            
            <div className="mb-3 sm:mb-4 flex flex-wrap items-center gap-2 sm:gap-4">
              <Badge variant="secondary" className="text-xs sm:text-sm">{court.sport_type}</Badge>
              <Badge variant="outline" className="text-xs sm:text-sm flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {is24HourCourt() 
                  ? 'Open 24 Hours' 
                  : `${convertTo12Hour(court.opening_time || '00:00')} - ${convertTo12Hour(court.closing_time || '23:00')}`}
              </Badge>
              <div className="flex items-center text-xs sm:text-sm text-muted-foreground">
                <MapPin className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />
                <span className="line-clamp-1">{court.address}, {court.city}, {court.state}</span>
              </div>
              {avgRating > 0 && (
                <div className="flex items-center">
                  <Star className="mr-1 h-3 w-3 sm:h-4 sm:w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium text-xs sm:text-sm">{avgRating.toFixed(1)}</span>
                  <span className="ml-1 text-xs sm:text-sm text-muted-foreground">
                    ({court.reviews?.length})
                  </span>
                </div>
              )}
            </div>

            <p className="mb-4 sm:mb-6 text-sm sm:text-base text-muted-foreground">{court.description}</p>

            {court.amenities && court.amenities.length > 0 && (
              <div className="mb-4 sm:mb-6">
                <h2 className="mb-2 text-base sm:text-lg md:text-xl font-semibold">Amenities</h2>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {court.amenities.map((amenity: string, index: number) => (
                    <Badge key={index} variant="outline" className="text-xs">{amenity}</Badge>
                  ))}
                </div>
              </div>
            )}

            {court.reviews && court.reviews.length > 0 && (
              <div>
                <h2 className="mb-3 sm:mb-4 text-base sm:text-lg md:text-xl font-semibold">Customer Reviews ({court.reviews.length})</h2>
                <div className="space-y-3 sm:space-y-4">
                  {court.reviews.map((review: any, index: number) => (
                    <Card key={index}>
                      <CardHeader className="p-3 sm:p-4 md:p-6">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-sm sm:text-base truncate">{review.profiles?.full_name || 'Anonymous'}</CardTitle>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-3 w-3 sm:h-4 sm:w-4 ${
                                  star <= review.rating
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <CardDescription className="text-xs sm:text-sm">
                          {format(new Date(review.created_at), 'MMM d, yyyy')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-4 md:p-6 pt-0">
                        {review.comment && (
                          <p className="text-xs sm:text-sm leading-relaxed">{review.comment}</p>
                        )}
                        {review.images && review.images.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
                            {review.images.map((imageUrl: string, imgIndex: number) => (
                              <img
                                key={imgIndex}
                                src={imageUrl}
                                alt={`Review photo ${imgIndex + 1}`}
                                className="w-full h-20 sm:h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
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
            <Card className="lg:sticky lg:top-20 overflow-hidden">
              <CardHeader className="bg-gradient-to-br from-primary/5 to-secondary/5 border-b p-3 sm:p-4 md:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg sm:text-xl md:text-2xl">Book Your Slot</CardTitle>
                    <CardDescription className="text-sm sm:text-base md:text-lg font-semibold text-primary mt-1">
                      {formatPrice(court.base_price)}/hour base rate
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6">
                {/* Date Selector with Toggle */}
                <div className="w-full min-w-0 overflow-x-hidden">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-sm sm:text-base md:text-lg font-semibold">Select a date</h3>
                    <div className="hidden sm:flex gap-1 p-1 bg-muted rounded-lg">
                      <Button
                        variant={viewMode === 'scroll' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-7 sm:h-8 px-2 sm:px-3"
                        onClick={() => setViewMode('scroll')}
                      >
                        <List className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                        size="sm"
                        className="h-7 sm:h-8 px-2 sm:px-3"
                        onClick={() => setViewMode('calendar')}
                      >
                        <CalendarIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Mobile: calendar only */}
                  <div className="flex flex-col items-center sm:hidden">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      disabled={(date) => isBefore(date, startOfDay(new Date())) && !isToday(date)}
                      className="rounded-md border pointer-events-auto"
                      modifiers={{
                        full: Object.entries(dateBookingStatus)
                          .filter(([_, status]) => status === 'full')
                          .map(([date]) => new Date(date)),
                        partial: Object.entries(dateBookingStatus)
                          .filter(([_, status]) => status === 'partial')
                          .map(([date]) => new Date(date)),
                      }}
                      modifiersStyles={{
                        full: { backgroundColor: 'hsl(var(--destructive) / 0.2)' },
                        partial: { backgroundColor: 'hsl(var(--warning) / 0.2)' },
                      }}
                    />
                    {/* Legend */}
                    <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <div className="h-3 w-3 rounded-sm bg-destructive/20 border border-destructive/30" />
                        <span>Fully Booked</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-3 w-3 rounded-sm bg-warning/20 border border-warning/30" />
                        <span>Partially Booked</span>
                      </div>
                    </div>
                  </div>

                  {/* Desktop/tablet: user can toggle */}
                  {viewMode === 'calendar' ? (
                    <div className="hidden flex-col items-center sm:flex">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => date && setSelectedDate(date)}
                        disabled={(date) => isBefore(date, startOfDay(new Date())) && !isToday(date)}
                        className="rounded-md border pointer-events-auto"
                        modifiers={{
                          full: Object.entries(dateBookingStatus)
                            .filter(([_, status]) => status === 'full')
                            .map(([date]) => new Date(date)),
                          partial: Object.entries(dateBookingStatus)
                            .filter(([_, status]) => status === 'partial')
                            .map(([date]) => new Date(date)),
                        }}
                        modifiersStyles={{
                          full: { backgroundColor: 'hsl(var(--destructive) / 0.2)' },
                          partial: { backgroundColor: 'hsl(var(--warning) / 0.2)' },
                        }}
                      />
                      {/* Legend */}
                      <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <div className="h-3 w-3 rounded-sm bg-destructive/20 border border-destructive/30" />
                          <span>Fully Booked</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="h-3 w-3 rounded-sm bg-warning/20 border border-warning/30" />
                          <span>Partially Booked</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative hidden w-full overflow-hidden sm:block">
                      {/* Desktop view with arrows */}
                      <div className="hidden sm:flex items-center justify-between gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-10 w-10 rounded-full"
                          onClick={() => {
                            if (desktopScrollRef.current) {
                              desktopScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                            }
                          }}
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </Button>
                        
                        <div ref={desktopScrollRef} className="flex-1 overflow-x-auto hide-scrollbar scroll-smooth">
                          <div className="flex gap-2 min-w-max px-1">
                            {Array.from({ length: 30 }).map((_, index) => {
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
                            if (desktopScrollRef.current) {
                              desktopScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                            }
                          }}
                        >
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                      </div>

                      {/* Mobile scroll view removed (calendar-only on mobile) */}
                    </div>
                  )}
                </div>

                {selectedDate && (
                  <>
                    {/* Duration Selector */}
                    <div>
                      <h3 className="text-xs sm:text-sm font-medium mb-2 sm:mb-3">Duration</h3>
                      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((hours) => (
                          <Button
                            key={hours}
                            variant={selectedHours === hours ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedHours(hours)}
                            className={`h-9 sm:h-11 text-xs sm:text-sm font-semibold transition-all ${
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
                      <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <h3 className="text-xs sm:text-sm font-medium">Select a time slot</h3>
                        <Button
                          type="button"
                          variant={showAvailableOnly ? "default" : "outline"}
                          size="sm"
                          onClick={() => setShowAvailableOnly(!showAvailableOnly)}
                          className="text-[10px] sm:text-xs gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3"
                        >
                          <Filter className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          {showAvailableOnly ? "All" : "Available"}
                        </Button>
                      </div>
                      
                      {loadingPricing ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                          <span className="text-sm text-muted-foreground">Loading available times...</span>
                        </div>
                      ) : (
                        <>
                          <div className="max-h-[280px] sm:max-h-[320px] overflow-y-auto pr-1 sm:pr-2 space-y-1.5 sm:space-y-2">
                            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                              {timeSlots
                                .filter((time) => {
                                  const startHour = parseInt(time.split(':')[0]);
                                  const closingHour = parseTimeHour(court?.closing_time, 23);
                                  const is24Hours = is24HourCourt();

                                  // For non-24h courts, don't allow selections that exceed the last generated slot hour
                                  // (for 24h courts, allow late starts like 11 PM even if booking ends after midnight)
                                  if (!is24Hours && startHour + (selectedHours - 1) > closingHour) return false;

                                  const slotStatus = getSlotStatus(time);

                                  // Always hide past, booked, and blocked slots
                                  if (slotStatus.hide) return false;

                                  // If filter is enabled, only show available slots
                                  if (showAvailableOnly && !slotStatus.available) return false;

                                  return true;
                                })
                                .map((time) => {
                                
                                const slotKey = `${time}-${addHoursToTime(time, 1)}`;
                                const pricing = slotPricing[slotKey];
                                const slotStatus = getSlotStatus(time);
                                const isSelected = selectedStartTime === time;
                                const hasPeakPricing = pricing && pricing.multiplier > 1;
                                const priceDisplay = pricing && !isNaN(pricing.price) ? formatPrice(pricing.price) : '...';
                                
                                return (
                                  <button
                                    key={time}
                                    onClick={() => {
                                      if (slotStatus.available) {
                                        setSelectedStartTime(time);
                                      } else {
                                        toast({
                                          title: 'Slot Not Available',
                                          description: `This time slot is ${slotStatus.reason.toLowerCase()}. Please select a different time.`,
                                          variant: 'destructive',
                                        });
                                      }
                                    }}
                                    disabled={!slotStatus.available}
                                    className={`relative p-2.5 sm:p-4 rounded-lg sm:rounded-xl border-2 transition-all text-left ${
                                      isSelected
                                        ? 'bg-primary text-primary-foreground border-primary shadow-lg scale-[1.02]'
                                        : slotStatus.available
                                        ? hasPeakPricing 
                                          ? 'bg-amber-50 border-amber-200 hover:border-amber-400 dark:bg-amber-950/20 dark:border-amber-800'
                                          : 'bg-card border-border hover:border-primary/50 hover:bg-muted/50'
                                        : 'bg-muted/30 border-muted cursor-not-allowed opacity-60'
                                    }`}
                                  >
                                    {hasPeakPricing && !isSelected && slotStatus.available && (
                                      <div className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 px-1 sm:px-1.5 py-0.5 bg-amber-500 text-white text-[8px] sm:text-[10px] font-bold rounded-full">
                                        {pricing.multiplier.toFixed(1)}×
                                      </div>
                                    )}
                                    <div className={`text-xs sm:text-base font-bold mb-0.5 sm:mb-1 ${
                                      isSelected ? 'text-primary-foreground' : slotStatus.available ? 'text-primary' : 'text-muted-foreground'
                                    }`}>
                                      {convertTo12Hour(time)}
                                    </div>
                                    {slotStatus.available ? (
                                      <div className={`text-[10px] sm:text-xs ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                        {selectedHours}h • {priceDisplay}/hr
                                      </div>
                                    ) : (
                                      <div className="text-[10px] sm:text-xs text-destructive font-medium">
                                        {slotStatus.reason}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {selectedStartTime && totalPrice !== null && !isNaN(totalPrice) && (
                            <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary/20 rounded-lg sm:rounded-xl">
                              <div className="flex justify-between items-center mb-3">
                                <div>
                                  <div className="text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">Total Price</div>
                                  <div className="text-[10px] sm:text-xs text-muted-foreground">
                                    {convertTo12Hour(selectedStartTime)} - {convertTo12Hour(addHoursToTime(selectedStartTime, selectedHours))}
                                    {priceBreakdown?.hourlyBreakdown?.some(h => h.isNextDay) && (
                                      <span className="ml-1 text-amber-600">(overnight)</span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-primary">
                                  {formatPrice(totalPrice)}
                                </div>
                              </div>
                              
                              {/* Detailed Hourly Breakdown */}
                              {priceBreakdown && priceBreakdown.hourlyBreakdown && priceBreakdown.hourlyBreakdown.length > 0 && (
                                <div className="pt-3 border-t border-primary/20 space-y-2">
                                  <div className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-2">
                                    Hourly Breakdown:
                                  </div>
                                  
                                  {/* Each hour row */}
                                  <div className="space-y-1.5">
                                    {priceBreakdown.hourlyBreakdown.map((hour, index) => (
                                      <div 
                                        key={index} 
                                        className={`flex justify-between items-center text-[10px] sm:text-xs px-2 py-1.5 rounded ${
                                          hour.multiplier > 1 
                                            ? 'bg-amber-500/10 border border-amber-500/30' 
                                            : 'bg-muted/50'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">
                                            Hour {hour.hour}: {convertTo12Hour(hour.startTime)} - {convertTo12Hour(hour.endTime)}
                                            {hour.isNextDay && <span className="text-amber-600 ml-1">(next day)</span>}
                                          </span>
                                          {hour.multiplier > 1 && (
                                            <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 bg-amber-500 text-white rounded font-bold">
                                              {hour.multiplier.toFixed(1)}×
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-muted-foreground text-[9px] sm:text-[10px]">
                                            {hour.rules[0]}
                                          </span>
                                          <span className={`font-bold ${hour.multiplier > 1 ? 'text-amber-600' : 'text-foreground'}`}>
                                            {formatPrice(hour.hourPrice)}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Summary section */}
                                  {priceBreakdown.summary && (priceBreakdown.summary.normalHours > 0 || priceBreakdown.summary.peakHours > 0) && (
                                    <div className="mt-3 pt-2 border-t border-primary/10 space-y-1">
                                      {priceBreakdown.summary.normalHours > 0 && (
                                        <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
                                          <span>Standard Rate ({priceBreakdown.summary.normalHours}h × {formatPrice(priceBreakdown.basePrice)})</span>
                                          <span>{formatPrice(priceBreakdown.summary.normalTotal)}</span>
                                        </div>
                                      )}
                                      {priceBreakdown.summary.peakHours > 0 && (
                                        <div className="flex justify-between text-[10px] sm:text-xs text-amber-600">
                                          <span>Peak/Special Rate ({priceBreakdown.summary.peakHours}h)</span>
                                          <span>{formatPrice(priceBreakdown.summary.peakTotal)}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}

                <Button
                  className="w-full text-sm sm:text-base py-4 sm:py-6 shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                  onClick={handleBooking}
                  disabled={!selectedDate || !selectedStartTime || bookingLoading || loadingPricing}
                >
                  {bookingLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      Reserving...
                    </>
                  ) : !selectedDate || !selectedStartTime ? (
                    'Select Date & Time'
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                      <span className="hidden sm:inline">Reserve & Continue to Payment</span>
                      <span className="sm:hidden">Reserve & Pay</span>
                    </>
                  )}
                </Button>
                {selectedDate && selectedStartTime && (
                  <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
                    🔒 Slot reserved for 5 mins
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
