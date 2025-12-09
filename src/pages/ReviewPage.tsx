import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Header } from '@/components/Header';
import { SEO } from '@/components/SEO';
import { ReviewForm } from '@/components/ReviewForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function ReviewPage() {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [existingReview, setExistingReview] = useState<any>(null);

  useEffect(() => {
    if (user && bookingId) {
      fetchBookingDetails();
    }
  }, [user, bookingId]);

  async function fetchBookingDetails() {
    try {
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select(`
          *,
          courts (id, name, city, location, images)
        `)
        .eq('id', bookingId)
        .eq('user_id', user?.id)
        .single();

      if (bookingError) throw bookingError;

      // Check if booking is in the past or completed
      const bookingDate = new Date(bookingData.booking_date);
      const isPast = bookingDate < new Date() || bookingData.status === 'completed';

      if (!isPast) {
        toast({
          title: 'Cannot review yet',
          description: 'You can only review completed bookings',
          variant: 'destructive',
        });
        navigate('/dashboard');
        return;
      }

      setBooking(bookingData);

      // Check if review already exists
      const { data: reviewData } = await supabase
        .from('reviews')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('user_id', user?.id)
        .maybeSingle();

      if (reviewData) {
        setExistingReview(reviewData);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  }

  const handleReviewSuccess = () => {
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title="Write a Review"
        description="Share your experience and help others find great sports courts. Leave a review for your recent booking."
        keywords="review, feedback, court review, rating"
      />
      <Header />
      
      <main className="container py-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-6 text-3xl font-bold">
            {existingReview ? 'Your Review' : 'Write a Review'}
          </h1>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Booking Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  {booking.courts?.images?.[0] && (
                    <img
                      src={booking.courts.images[0]}
                      alt={booking.courts.name}
                      className="h-24 w-24 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{booking.courts?.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {booking.courts?.city}, {booking.courts?.location}
                    </p>
                    <p className="mt-2 text-sm">
                      <span className="font-medium">Date:</span>{' '}
                      {format(new Date(booking.booking_date), 'MMMM d, yyyy')}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Time:</span>{' '}
                      {booking.start_time} - {booking.end_time}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {existingReview ? (
              <Card>
                <CardHeader>
                  <CardTitle>You've already reviewed this booking</CardTitle>
                  <CardDescription>Thank you for your feedback!</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium">Your Rating</p>
                    <div className="flex gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span key={star} className="text-yellow-400">★</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Your Review</p>
                    <p className="text-sm text-muted-foreground mt-1">{existingReview.comment}</p>
                  </div>
                  {existingReview.images && existingReview.images.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Photos</p>
                      <div className="grid grid-cols-3 gap-2">
                        {existingReview.images.map((url: string, index: number) => (
                          <img
                            key={index}
                            src={url}
                            alt={`Review ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Share Your Experience</CardTitle>
                  <CardDescription>
                    Help others by sharing your honest feedback about this court
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ReviewForm
                    courtId={booking.courts?.id}
                    bookingId={booking.id}
                    onSuccess={handleReviewSuccess}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
