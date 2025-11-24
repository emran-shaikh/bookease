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
import { Loader2, Clock, Banknote } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'jazzcash' | 'easypaisa' | 'bank_transfer' | 'cash'>('cash');

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

    if (paymentMethod === 'stripe') {
      createPaymentIntent();
    }
  }, [paymentMethod]);

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

  async function handleBookingSuccess(paymentIntentId?: string) {
    setLoading(true);
    
    try {
      const [startTime, endTime] = timeSlot.split('-');
      
      const bookingStatus = paymentMethod === 'cash' ? 'pending' : 'confirmed';
      const paymentStatus = paymentMethod === 'cash' ? 'pending' : 'succeeded';
      
      const { error } = await supabase.from('bookings').insert({
        court_id: court.id,
        user_id: user?.id,
        booking_date: format(date, 'yyyy-MM-dd'),
        start_time: startTime,
        end_time: endTime,
        total_price: court.base_price,
        status: bookingStatus,
        payment_status: paymentStatus,
        payment_intent_id: paymentIntentId || null,
        notes: notes ? `Payment Method: ${paymentMethod.toUpperCase()}${notes ? ' | ' + notes : ''}` : `Payment Method: ${paymentMethod.toUpperCase()}`,
      });

      if (error) {
        if (error.message.includes('overlaps with an existing booking') || 
            error.message.includes('unique_booking_slot')) {
          toast({
            title: 'Slot Already Booked',
            description: 'Someone just booked this slot.',
            variant: 'destructive',
          });
        } else {
          throw error;
        }
        navigate(`/courts/${id}`);
        return;
      }

      const lock = getCurrentUserLock(startTime, endTime);
      if (lock) {
        await unlockSlot(lock.id);
      }

      toast({
        title: '🎉 Booking Confirmed!',
        description: paymentMethod === 'cash' 
          ? `Your booking is confirmed. Please pay at the venue on ${format(date, 'MMM d, yyyy')}` 
          : `Your court is booked for ${format(date, 'MMM d, yyyy')} at ${timeSlot}`,
      });
      
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Booking Error',
        description: error.message || 'Failed to create booking. Please contact support.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleLocalPaymentBooking() {
    await handleBookingSuccess();
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
                <CardTitle>Payment Method</CardTitle>
                <CardDescription>Choose your preferred payment option</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <RadioGroup value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                  <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-accent" onClick={() => setPaymentMethod('cash')}>
                    <RadioGroupItem value="cash" id="cash" />
                    <Label htmlFor="cash" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-semibold">Cash on Arrival</p>
                          <p className="text-xs text-muted-foreground">Pay at the venue</p>
                        </div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-accent" onClick={() => setPaymentMethod('jazzcash')}>
                    <RadioGroupItem value="jazzcash" id="jazzcash" />
                    <Label htmlFor="jazzcash" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-orange-500" />
                        <div>
                          <p className="font-semibold">JazzCash</p>
                          <p className="text-xs text-muted-foreground">Mobile wallet payment</p>
                        </div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-accent" onClick={() => setPaymentMethod('easypaisa')}>
                    <RadioGroupItem value="easypaisa" id="easypaisa" />
                    <Label htmlFor="easypaisa" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-green-600" />
                        <div>
                          <p className="font-semibold">EasyPaisa</p>
                          <p className="text-xs text-muted-foreground">Mobile wallet payment</p>
                        </div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-accent" onClick={() => setPaymentMethod('bank_transfer')}>
                    <RadioGroupItem value="bank_transfer" id="bank_transfer" />
                    <Label htmlFor="bank_transfer" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-blue-600" />
                        <div>
                          <p className="font-semibold">Bank Transfer</p>
                          <p className="text-xs text-muted-foreground">Direct bank payment</p>
                        </div>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-accent" onClick={() => setPaymentMethod('stripe')}>
                    <RadioGroupItem value="stripe" id="stripe" />
                    <Label htmlFor="stripe" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-purple-600" />
                        <div>
                          <p className="font-semibold">Credit/Debit Card</p>
                          <p className="text-xs text-muted-foreground">Pay with Stripe</p>
                        </div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>

                <Separator />

                {paymentMethod === 'stripe' ? (
                  clientSecret ? (
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
                  )
                ) : (
                  <div className="space-y-4">
                    {paymentMethod === 'jazzcash' && (
                      <div className="rounded-lg bg-orange-50 dark:bg-orange-950/20 p-4 text-sm">
                        <p className="font-semibold mb-2">JazzCash Payment Instructions:</p>
                        <p className="text-muted-foreground">You'll receive payment instructions via SMS after confirming your booking.</p>
                      </div>
                    )}
                    {paymentMethod === 'easypaisa' && (
                      <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-4 text-sm">
                        <p className="font-semibold mb-2">EasyPaisa Payment Instructions:</p>
                        <p className="text-muted-foreground">You'll receive payment instructions via SMS after confirming your booking.</p>
                      </div>
                    )}
                    {paymentMethod === 'bank_transfer' && (
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4 text-sm">
                        <p className="font-semibold mb-2">Bank Transfer Details:</p>
                        <p className="text-muted-foreground">Bank details will be sent to your email after booking confirmation.</p>
                      </div>
                    )}
                    {paymentMethod === 'cash' && (
                      <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-4 text-sm">
                        <p className="font-semibold mb-2">Cash Payment:</p>
                        <p className="text-muted-foreground">Please bring exact cash amount when you arrive at the venue.</p>
                      </div>
                    )}
                    <Button 
                      onClick={handleLocalPaymentBooking} 
                      disabled={loading} 
                      className="w-full"
                      size="lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Confirming...
                        </>
                      ) : (
                        'Confirm Booking'
                      )}
                    </Button>
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
