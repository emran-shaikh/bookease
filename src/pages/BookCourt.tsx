import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useSlotLock } from '@/hooks/useSlotLock';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const STRIPE_PUBLISHABLE_KEY = 'pk_test_51SSBmnLZr8CjOqMuDiSm1WASkrmK8khlJxuvPHSBEOVv5sEwyK3g4XZScU31C6ZtLbKsOHLxMS9iV6HaFhEygfrh00Nodfg4f3';
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

function CheckoutForm({ bookingData, onSuccess }: any) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });

      if (error) {
        toast({
          title: 'Payment failed',
          description: error.message,
          variant: 'destructive',
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        await onSuccess(paymentIntent.id);
      }
    } catch (error: any) {
      toast({
        title: 'Error processing payment',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button type="submit" disabled={!stripe || loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          'Complete Booking'
        )}
      </Button>
    </form>
  );
}

export default function BookCourt() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [notes, setNotes] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds

  const { court, date, timeSlot, lockId } = location.state || {};
  const { unlockSlot, getCurrentUserLock } = useSlotLock(court?.id || '', date || null);

  // Timer countdown
  useEffect(() => {
    if (!timeRemaining) {
      toast({
        title: 'Reservation expired',
        description: 'Please select a new time slot',
        variant: 'destructive',
      });
      navigate(`/courts/${id}`);
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  // Cleanup lock on unmount or navigation
  useEffect(() => {
    return () => {
      const [startTime, endTime] = timeSlot?.split('-') || [];
      if (startTime && endTime) {
        const lock = getCurrentUserLock(startTime, endTime);
        if (lock) {
          unlockSlot(lock.id);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!court || !date || !timeSlot) {
      toast({
        title: 'Missing booking information',
        description: 'Please select a date and time',
        variant: 'destructive',
      });
      navigate(`/courts/${id}`);
      return;
    }

    createPaymentIntent();
  }, []);

  async function createPaymentIntent() {
    try {
      const [startTime, endTime] = timeSlot.split('-').map((t: string) => t.trim());
      
      const response = await supabase.functions.invoke('create-payment-intent', {
        body: {
          courtId: court.id,
          courtName: court.name,
          date: format(date, 'yyyy-MM-dd'),
          startTime,
          endTime,
        },
      });

      if (response.error) throw response.error;

      setClientSecret(response.data.clientSecret);
    } catch (error: any) {
      toast({
        title: 'Error creating payment',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  async function handleBookingSuccess(paymentIntentId: string) {
    setLoading(true);
    
    try {
      const [startTime, endTime] = timeSlot.split('-');
      
      const { error } = await supabase.from('bookings').insert({
        court_id: court.id,
        user_id: user?.id,
        booking_date: format(date, 'yyyy-MM-dd'),
        start_time: startTime,
        end_time: endTime,
        total_price: court.base_price,
        status: 'confirmed',
        payment_status: 'succeeded',
        payment_intent_id: paymentIntentId,
        notes: notes || null,
      });

      if (error) throw error;

      // Release the lock after successful booking
      const lock = getCurrentUserLock(startTime, endTime);
      if (lock) {
        await unlockSlot(lock.id);
      }

      toast({
        title: 'Booking confirmed!',
        description: 'Your court has been successfully booked.',
      });
      
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Error creating booking',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  if (!court || !date || !timeSlot) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold">Complete Your Booking</h1>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              <span className={timeRemaining < 60 ? 'text-destructive font-medium' : ''}>
                {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')} remaining
              </span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Booking Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium">Court</p>
                  <p className="text-lg">{court.name}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium">Date</p>
                  <p className="text-lg">{format(date, 'MMMM d, yyyy')}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium">Time</p>
                  <p className="text-lg">{timeSlot}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium">Total Price</p>
                  <p className="text-2xl font-bold">${court.base_price}</p>
                </div>
                <Separator />
                <div>
                  <Label htmlFor="notes">Additional Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any special requirements or notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Information</CardTitle>
                <CardDescription>Secure payment powered by Stripe</CardDescription>
              </CardHeader>
              <CardContent>
                {clientSecret ? (
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <CheckoutForm
                      bookingData={{ court, date, timeSlot, notes }}
                      onSuccess={handleBookingSuccess}
                    />
                  </Elements>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
