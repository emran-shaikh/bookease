import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useSlotLock } from '@/hooks/useSlotLock';
import { Header } from '@/components/Header';
import { SEO } from '@/components/SEO';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, Clock, Banknote, CreditCard, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { formatPrice } from '@/lib/currency';

export default function BookCourt() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds
  const [paymentMethod, setPaymentMethod] = useState<'payfast' | 'bank_transfer'>('bank_transfer');
  const [priceCalculation, setPriceCalculation] = useState<{
    basePrice: number;
    hours: number;
    priceMultiplier: number;
    totalPrice: string;
    appliedRules: string[];
  } | null>(null);
  const [calculatingPrice, setCalculatingPrice] = useState(true);
  const [processingPayfast, setProcessingPayfast] = useState(false);

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

    calculatePrice();
  }, [court, date, timeSlot]);

  async function calculatePrice() {
    try {
      setCalculatingPrice(true);
      const [startTime, endTime] = timeSlot.split('-').map((t: string) => t.trim());
      
      const response = await supabase.functions.invoke('calculate-price', {
        body: {
          courtId: court.id,
          date: format(date, 'yyyy-MM-dd'),
          startTime,
          endTime,
        },
      });

      if (response.error) throw response.error;

      setPriceCalculation(response.data);
    } catch (error: any) {
      toast({
        title: 'Error calculating price',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setCalculatingPrice(false);
    }
  }

  async function handlePayfastPayment() {
    if (!priceCalculation) return;
    
    setProcessingPayfast(true);
    try {
      const [startTime, endTime] = timeSlot.split('-').map((t: string) => t.trim());
      
      const response = await supabase.functions.invoke('create-payfast-payment', {
        body: {
          courtId: court.id,
          courtName: court.name,
          date: format(date, 'yyyy-MM-dd'),
          startTime,
          endTime,
          totalPrice: parseFloat(priceCalculation.totalPrice),
        },
      });

      if (response.error) throw response.error;

      if (response.data.success) {
        // Create a form and submit to PayFast
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = response.data.paymentUrl;
        form.target = '_blank';

        Object.entries(response.data.formData).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(value);
          form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);

        toast({
          title: 'Redirecting to PayFast',
          description: 'Complete your payment in the new window',
        });
      } else {
        throw new Error(response.data.error || 'Failed to create payment');
      }
    } catch (error: any) {
      toast({
        title: 'Payment Error',
        description: error.message || 'Failed to initiate payment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setProcessingPayfast(false);
    }
  }

  async function handleBookingSuccess(paymentIntentId?: string) {
    setLoading(true);
    
    try {
      const [startTime, endTime] = timeSlot.split('-');
      
      const bookingStatus = paymentMethod === 'payfast' ? 'confirmed' : 'pending';
      const paymentStatus = paymentMethod === 'payfast' ? 'succeeded' : 'pending';
      
      const { error } = await supabase.from('bookings').insert({
        court_id: court.id,
        user_id: user?.id,
        booking_date: format(date, 'yyyy-MM-dd'),
        start_time: startTime,
        end_time: endTime,
        total_price: priceCalculation ? parseFloat(priceCalculation.totalPrice) : court.base_price,
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

      // Send booking confirmation email
      if (bookingStatus === 'confirmed') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name, phone')
          .eq('id', user?.id)
          .single();

        if (profile?.email) {
          await supabase.functions.invoke('send-booking-confirmation', {
            body: {
              userEmail: profile.email,
              userName: profile.full_name || 'Customer',
              courtName: court.name,
              bookingDate: format(date, 'MMMM d, yyyy'),
              startTime: startTime,
              endTime: endTime,
              totalPrice: priceCalculation ? parseFloat(priceCalculation.totalPrice) : court.base_price,
              userPhone: profile.phone,
            }
          });
        }
      }

      const lock = getCurrentUserLock(startTime, endTime);
      if (lock) {
        await unlockSlot(lock.id);
      }

      toast({
        title: paymentMethod === 'payfast' ? '🎉 Booking Confirmed!' : '⏳ Booking Pending',
        description: paymentMethod === 'payfast' 
          ? `Your court is booked for ${format(date, 'MMM d, yyyy')} at ${timeSlot}` 
          : `Your booking request is received. It will be confirmed once payment is verified.`,
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

  async function handleBankTransferBooking() {
    await handleBookingSuccess();
  }

  if (!court || !date || !timeSlot) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title={court ? `Book ${court.name}` : 'Complete Booking'}
        description={court ? `Complete your booking for ${court.name}. Secure your court slot now with easy payment options.` : 'Complete your court booking on BookedHours.'}
        keywords="book court, checkout, payment, court reservation"
      />
      <Header />
      
      <main className="container py-4 sm:py-6 md:py-8 px-4">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Complete Booking</h1>
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className={timeRemaining < 60 ? 'text-destructive font-medium' : ''}>
                {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')} left
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="p-3 sm:p-4 md:p-6">
                <CardTitle className="text-base sm:text-lg">Booking Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-4 md:p-6 pt-0">
                <div>
                  <p className="text-xs sm:text-sm font-medium">Court</p>
                  <p className="text-sm sm:text-base md:text-lg">{court.name}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs sm:text-sm font-medium">Date</p>
                  <p className="text-sm sm:text-base md:text-lg">{format(date, 'MMMM d, yyyy')}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs sm:text-sm font-medium">Time</p>
                  <p className="text-sm sm:text-base md:text-lg">{timeSlot}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs sm:text-sm font-medium mb-2">Price Breakdown</p>
                  {calculatingPrice ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                      <span className="text-xs sm:text-sm text-muted-foreground">Calculating...</span>
                    </div>
                  ) : priceCalculation ? (
                    <div className="space-y-1.5 sm:space-y-2">
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Base (per hr)</span>
                        <span>{formatPrice(priceCalculation.basePrice)}</span>
                      </div>
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Duration</span>
                        <span>{priceCalculation.hours} hr{priceCalculation.hours > 1 ? 's' : ''}</span>
                      </div>
                      {priceCalculation.appliedRules.length > 0 && (
                        <div className="pt-1.5 sm:pt-2 border-t">
                          <p className="text-[10px] sm:text-xs font-medium text-amber-600 dark:text-amber-500 mb-1">
                            💰 Special Pricing:
                          </p>
                          {priceCalculation.appliedRules.map((rule, idx) => (
                            <p key={idx} className="text-[10px] sm:text-xs text-muted-foreground pl-3 sm:pl-4">
                              • {rule}
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-between text-base sm:text-lg font-bold pt-1.5 sm:pt-2 border-t">
                        <span>Total</span>
                        <span className="text-primary">{formatPrice(priceCalculation.totalPrice)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-lg sm:text-xl md:text-2xl font-bold">{formatPrice(court.base_price)}</p>
                  )}
                </div>
                <Separator />
                <div>
                  <Label htmlFor="notes" className="text-xs sm:text-sm">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any special requirements..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1.5 sm:mt-2 text-sm min-h-[60px] sm:min-h-[80px]"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-3 sm:p-4 md:p-6">
                <CardTitle className="text-base sm:text-lg">Payment Method</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Choose your payment option (PKR)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6 pt-0">
                <RadioGroup value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                  <div 
                    className={`flex items-center space-x-2 sm:space-x-3 rounded-lg border p-3 sm:p-4 cursor-pointer transition-all ${
                      paymentMethod === 'bank_transfer' 
                        ? 'border-primary bg-primary/5' 
                        : 'hover:bg-accent'
                    }`} 
                    onClick={() => setPaymentMethod('bank_transfer')}
                  >
                    <RadioGroupItem value="bank_transfer" id="bank_transfer" />
                    <Label htmlFor="bank_transfer" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm sm:text-base">Bank Transfer</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">Transfer to bank (PKR)</p>
                        </div>
                      </div>
                    </Label>
                  </div>

                  <div 
                    className={`flex items-center space-x-2 sm:space-x-3 rounded-lg border p-3 sm:p-4 cursor-pointer transition-all ${
                      paymentMethod === 'payfast' 
                        ? 'border-primary bg-primary/5' 
                        : 'hover:bg-accent'
                    }`} 
                    onClick={() => setPaymentMethod('payfast')}
                  >
                    <RadioGroupItem value="payfast" id="payfast" />
                    <Label htmlFor="payfast" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm sm:text-base">PayFast Card</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">Instant payment (PKR)</p>
                        </div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>

                <Separator />

                {paymentMethod === 'payfast' ? (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4 text-sm space-y-3">
                      <div className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-blue-600" />
                        <p className="font-semibold">Secure Payment via PayFast</p>
                      </div>
                      <p className="text-muted-foreground">
                        You will be redirected to PayFast's secure payment gateway to complete your payment using your debit or credit card.
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>✓ 256-bit SSL encryption</span>
                        <span>✓ PCI DSS compliant</span>
                      </div>
                    </div>
                    <Button 
                      onClick={handlePayfastPayment} 
                      disabled={processingPayfast || calculatingPrice} 
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                      size="lg"
                    >
                      {processingPayfast ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting to PayFast...
                        </>
                      ) : (
                        <>
                          <CreditCard className="mr-2 h-4 w-4" />
                          Pay {priceCalculation ? formatPrice(priceCalculation.totalPrice) : ''} with PayFast
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-4 text-sm space-y-3">
                      <p className="font-semibold text-emerald-700 dark:text-emerald-400">Bank Transfer Instructions:</p>
                      <div className="space-y-2 text-muted-foreground">
                        <p><span className="font-medium">Bank:</span> National Bank of Pakistan</p>
                        <p><span className="font-medium">Account Title:</span> CourtConnect</p>
                        <p><span className="font-medium">Account Number:</span> 1234567890123</p>
                        <p><span className="font-medium">IBAN:</span> PK36NBPA0000001234567890</p>
                        <p className="text-xs mt-2 text-amber-600 dark:text-amber-400">⚠️ Please include your name and booking reference in the transfer description.</p>
                        <p className="text-xs">Your booking will be confirmed within 24 hours after payment verification.</p>
                      </div>
                    </div>
                    <Button 
                      onClick={handleBankTransferBooking} 
                      disabled={loading || calculatingPrice} 
                      className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800"
                      size="lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Banknote className="mr-2 h-4 w-4" />
                          Submit Booking Request
                        </>
                      )}
                    </Button>
                  </div>
                )}

                <p className="text-xs text-center text-muted-foreground">
                  By proceeding, you agree to our terms and conditions. All prices are in Pakistani Rupees (PKR).
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
