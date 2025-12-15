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
import { Loader2, Clock, Banknote, Building, MessageCircle, ExternalLink, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { formatPrice } from '@/lib/currency';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface OwnerPaymentInfo {
  bank_name: string | null;
  account_title: string | null;
  account_number: string | null;
  whatsapp_number: string | null;
}

export default function BookCourt() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds
  const [priceCalculation, setPriceCalculation] = useState<{
    basePrice: number;
    hours: number;
    priceMultiplier: number;
    totalPrice: string;
    appliedRules: string[];
  } | null>(null);
  const [calculatingPrice, setCalculatingPrice] = useState(true);
  const [ownerPaymentInfo, setOwnerPaymentInfo] = useState<OwnerPaymentInfo | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

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
      navigate(`/courts/${court?.slug || slug}`);
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
      navigate(`/courts/${slug}`);
      return;
    }

    calculatePrice();
    fetchOwnerPaymentInfo();
  }, [court, date, timeSlot]);

  async function fetchOwnerPaymentInfo() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('bank_name, account_title, account_number, whatsapp_number')
        .eq('id', court.owner_id)
        .single();

      if (error) throw error;
      setOwnerPaymentInfo(data);
    } catch (error: any) {
      console.error('Error fetching owner payment info:', error);
    }
  }

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

  async function handleBookingSubmit() {
    setLoading(true);
    
    try {
      const [startTime, endTime] = timeSlot.split('-');
      
      const { error } = await supabase.from('bookings').insert({
        court_id: court.id,
        user_id: user?.id,
        booking_date: format(date, 'yyyy-MM-dd'),
        start_time: startTime,
        end_time: endTime,
        total_price: priceCalculation ? parseFloat(priceCalculation.totalPrice) : court.base_price,
        status: 'pending',
        payment_status: 'pending',
        notes: notes || null,
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
        navigate(`/courts/${court?.slug || slug}`);
        return;
      }

      const lock = getCurrentUserLock(startTime, endTime);
      if (lock) {
        await unlockSlot(lock.id);
      }

      // Send email notifications to user and owner
      try {
        // Fetch owner email
        const { data: ownerProfile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', court.owner_id)
          .single();

        // Fetch user profile
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('email, full_name, phone')
          .eq('id', user?.id)
          .single();

        await supabase.functions.invoke('send-booking-confirmation', {
          body: {
            userEmail: userProfile?.email || user?.email,
            userName: userProfile?.full_name || 'Customer',
            courtName: court.name,
            bookingDate: format(date, 'MMMM d, yyyy'),
            startTime,
            endTime,
            totalPrice: priceCalculation ? parseFloat(priceCalculation.totalPrice) : court.base_price,
            userPhone: userProfile?.phone,
            ownerEmail: ownerProfile?.email,
            ownerName: ownerProfile?.full_name,
            isPendingPayment: true,
          },
        });
      } catch (emailError) {
        console.error('Failed to send notification emails:', emailError);
      }

      // Show success dialog with payment instructions
      setShowSuccessDialog(true);
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

  function handleWhatsAppClick() {
    if (!ownerPaymentInfo?.whatsapp_number) return;
    
    // Format WhatsApp number (remove spaces and special chars except +)
    const phone = ownerPaymentInfo.whatsapp_number.replace(/[^\d+]/g, '');
    const message = encodeURIComponent(
      `Hi! I just booked ${court.name} for ${format(date, 'MMMM d, yyyy')} at ${timeSlot}. Total: ${priceCalculation ? formatPrice(priceCalculation.totalPrice) : formatPrice(court.base_price)}. I'll send the payment screenshot shortly.`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
  }

  function handleDialogClose() {
    setShowSuccessDialog(false);
    navigate('/dashboard');
  }

  if (!court || !date || !timeSlot) {
    return null;
  }

  const hasPaymentInfo = ownerPaymentInfo?.bank_name && ownerPaymentInfo?.account_number;

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title={court ? `Book ${court.name}` : 'Complete Booking'}
        description={court ? `Complete your booking for ${court.name}. Secure your court slot now.` : 'Complete your court booking on BookedHours.'}
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
                <CardTitle className="text-base sm:text-lg">Payment Information</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Transfer payment to confirm your booking</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6 pt-0">
                {hasPaymentInfo ? (
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-4 text-sm space-y-3">
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                      <Banknote className="h-4 w-4" />
                      Bank Account Details
                    </p>
                    <div className="space-y-2 text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <Building className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">Bank Name</p>
                          <p>{ownerPaymentInfo?.bank_name}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-3">
                        <div>
                          <p className="font-medium text-foreground text-xs">Title</p>
                          <p className="text-sm">{ownerPaymentInfo?.account_title}</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-xs">Account#</p>
                          <p className="text-sm font-mono">{ownerPaymentInfo?.account_number}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
                    <p className="text-amber-700 dark:text-amber-400">
                      ⚠️ The court owner hasn't added their payment details yet. Please contact them via WhatsApp after booking.
                    </p>
                  </div>
                )}

                {ownerPaymentInfo?.whatsapp_number && (
                  <Button 
                    variant="outline" 
                    className="w-full gap-2 border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
                    onClick={handleWhatsAppClick}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Contact via WhatsApp
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                )}

                <Separator />

                <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
                  <p className="font-medium">How it works:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
                    <li>Submit your booking request below</li>
                    <li>Transfer the payment to the bank account shown</li>
                    <li>Upload payment screenshot from your dashboard or send via WhatsApp</li>
                    <li>Owner will confirm your booking after verifying payment</li>
                  </ol>
                </div>

                <Button 
                  onClick={handleBookingSubmit} 
                  disabled={loading || calculatingPrice} 
                  className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Submit Booking ({priceCalculation ? formatPrice(priceCalculation.totalPrice) : ''})
                    </>
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Your booking will be on hold for 30 minutes. Please complete payment promptly.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
              Booking Successful!
            </DialogTitle>
            <DialogDescription className="text-base font-medium pt-2">
              Your Booking is on hold for 30 minute(s).
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              To confirm and reserve your booking, please transfer the <strong>Advance Payment</strong> to the bank account below:
            </p>

            {hasPaymentInfo && (
              <div className="rounded-lg border p-4">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="font-medium">Bank Name</div>
                  <div className="font-medium">Title</div>
                  <div className="font-medium">Account#</div>
                  <div className="text-muted-foreground">{ownerPaymentInfo?.bank_name}</div>
                  <div className="text-muted-foreground">{ownerPaymentInfo?.account_title}</div>
                  <div className="text-muted-foreground font-mono text-xs">{ownerPaymentInfo?.account_number}</div>
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Once the payment is made, kindly send a confirmation screenshot via <strong>WhatsApp</strong> or upload it directly from your <strong>Profile</strong>.
            </p>

            <div className="flex gap-2">
              <Button 
                className="flex-1"
                onClick={handleDialogClose}
              >
                Done!
              </Button>
              {ownerPaymentInfo?.whatsapp_number && (
                <Button 
                  variant="outline" 
                  size="icon"
                  className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
                  onClick={handleWhatsAppClick}
                >
                  <MessageCircle className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
