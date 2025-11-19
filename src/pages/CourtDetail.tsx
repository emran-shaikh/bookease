import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MapPin, Star, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function CourtDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [court, setCourt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState('');
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<string[]>([]);

  useEffect(() => {
    if (id) {
      fetchCourtDetails();
    }
  }, [id]);

  useEffect(() => {
    if (selectedDate && id) {
      fetchBookedSlots();
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

  const timeSlots = [
    '06:00-07:00', '07:00-08:00', '08:00-09:00', '09:00-10:00',
    '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00',
    '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00',
    '18:00-19:00', '19:00-20:00', '20:00-21:00', '21:00-22:00',
  ];

  const isSlotAvailable = (slot: string) => {
    return !bookedSlots.includes(slot) && !blockedSlots.includes(slot);
  };

  const handleBooking = () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to book a court',
        variant: 'destructive',
      });
      navigate('/auth');
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

    navigate(`/book/${id}`, {
      state: {
        court,
        date: selectedDate,
        timeSlot: selectedTime,
      },
    });
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
                  />
                </div>

                {selectedDate && (
                  <div>
                    <label className="mb-2 block text-sm font-medium">Select Time</label>
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
                        {timeSlots.map((slot) => (
                          <SelectItem
                            key={slot}
                            value={slot}
                            disabled={!isSlotAvailable(slot)}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span>{slot}</span>
                              {!isSlotAvailable(slot) && (
                                <Badge variant="secondary" className="ml-2">Unavailable</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={handleBooking}
                  disabled={!selectedDate || !selectedTime}
                >
                  Continue to Payment
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
