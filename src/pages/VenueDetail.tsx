import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { SEO } from '@/components/SEO';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, Clock, Star, Phone, Mail, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatPrice } from '@/lib/currency';
import { resolveCourtData } from '@/lib/venue-utils';

interface VenueData {
  id: string;
  slug: string;
  name: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  location: string;
  images: string[];
  amenities: string[];
  default_opening_time: string;
  default_closing_time: string;
  contact_email: string;
  contact_phone: string;
  owner_id: string;
  status: string;
  is_active: boolean;
}

interface Court {
  id: string;
  slug: string;
  name: string;
  description: string;
  sport_type: string;
  base_price: number;
  images: string[];
  court_specific_images: string[];
  opening_time: string;
  closing_time: string;
  opening_time_override: string;
  closing_time_override: string;
  rating?: number;
  reviews_count?: number;
}

export default function VenueDetail() {
  const { venueSlug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);

  useEffect(() => {
    if (venueSlug) {
      fetchVenueData();
    }
  }, [venueSlug]);

  async function fetchVenueData() {
    try {
      // Fetch venue
      const { data: venueData, error: venueError } = await supabase
        .from('venues')
        .select('*')
        .eq('slug', venueSlug)
        .eq('status', 'approved')
        .eq('is_active', true)
        .single();

      if (venueError) throw venueError;
      if (!venueData) {
        navigate('/venues');
        return;
      }

      setVenue(venueData);

      // Fetch courts for this venue with ratings
      const { data: courtsData, error: courtsError } = await supabase
        .from('courts')
        .select(`
          *,
          reviews (rating)
        `)
        .eq('venue_id', venueData.id)
        .eq('status', 'approved')
        .eq('is_active', true);

      if (courtsError) throw courtsError;

      // Calculate ratings for each court
      const courtsWithRatings = (courtsData || []).map((court: any) => {
        const ratings = court.reviews?.map((r: any) => r.rating) || [];
        const avgRating = ratings.length > 0
          ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
          : 0;
        
        return {
          ...court,
          rating: avgRating,
          reviews_count: ratings.length,
        };
      });

      setCourts(courtsWithRatings);
    } catch (error: any) {
      toast({
        title: 'Error loading venue',
        description: error.message,
        variant: 'destructive',
      });
      navigate('/venues');
    } finally {
      setLoading(false);
    }
  }

  function formatTime(time: string): string {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${period}`;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!venue) {
    return null;
  }

  const allImages = venue.images || [];

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title={`${venue.name} | Sports Venue in ${venue.city}`}
        description={venue.description || `Book sports courts at ${venue.name} in ${venue.city}. Multiple courts available for various sports.`}
        keywords={`${venue.name}, sports venue, ${venue.city}, court booking`}
        canonical={`https://bookedhours.com/venues/${venue.slug}`}
      />
      <Header />
      
      <main className="container py-4 sm:py-6 md:py-8 px-4">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/venues')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Venues
        </Button>

        {/* Image Gallery */}
        {allImages.length > 0 && (
          <div className="mb-6">
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
              <img
                src={allImages[selectedImage]}
                alt={venue.name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/placeholder.svg';
                }}
              />
            </div>
            {allImages.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                {allImages.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`h-16 w-24 flex-shrink-0 overflow-hidden rounded-md border-2 ${
                      selectedImage === index ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={img}
                      alt={`${venue.name} ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Venue Info */}
        <div className="grid gap-6 lg:grid-cols-3 mb-8">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">{venue.name}</h1>
              <div className="flex items-center text-muted-foreground mb-4">
                <MapPin className="h-4 w-4 mr-1" />
                <span>{venue.address}, {venue.city}, {venue.state} {venue.zip_code}</span>
              </div>
              {venue.description && (
                <p className="text-muted-foreground">{venue.description}</p>
              )}
            </div>

            {/* Amenities */}
            {venue.amenities && venue.amenities.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2">Venue Amenities</h3>
                <div className="flex flex-wrap gap-2">
                  {venue.amenities.map((amenity, index) => (
                    <Badge key={index} variant="secondary">
                      {amenity}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Venue Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  {formatTime(venue.default_opening_time)} - {formatTime(venue.default_closing_time)}
                </span>
              </div>
              
              {venue.contact_phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${venue.contact_phone}`} className="hover:text-primary">
                    {venue.contact_phone}
                  </a>
                </div>
              )}
              
              {venue.contact_email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${venue.contact_email}`} className="hover:text-primary">
                    {venue.contact_email}
                  </a>
                </div>
              )}

              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">
                  {courts.length} {courts.length === 1 ? 'court' : 'courts'} available
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Courts Section */}
        <div>
          <h2 className="text-xl sm:text-2xl font-bold mb-4">Available Courts</h2>
          
          {courts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No courts available at this venue</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {courts.map((court) => {
                const resolved = resolveCourtData(court, venue);
                const courtImages = court.court_specific_images?.length > 0 
                  ? court.court_specific_images 
                  : court.images;

                return (
                  <Card key={court.id} className="overflow-hidden transition-shadow hover:shadow-lg group">
                    <div className="aspect-video w-full overflow-hidden bg-muted">
                      {courtImages && courtImages.length > 0 ? (
                        <img
                          src={courtImages[0]}
                          alt={court.name}
                          className="h-full w-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300"
                          onClick={() => navigate(`/courts/${court.slug}`)}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/placeholder.svg';
                          }}
                        />
                      ) : venue.images && venue.images.length > 0 ? (
                        <img
                          src={venue.images[0]}
                          alt={court.name}
                          className="h-full w-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300"
                          onClick={() => navigate(`/courts/${court.slug}`)}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          No image
                        </div>
                      )}
                    </div>
                    
                    <CardHeader className="p-3 sm:p-4">
                      <CardTitle className="line-clamp-1 text-base sm:text-lg">{court.name}</CardTitle>
                      <CardDescription className="line-clamp-2 text-xs sm:text-sm">
                        {court.description}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="p-3 sm:p-4 pt-0">
                      <div className="space-y-1.5 sm:space-y-2">
                        <Badge variant="secondary" className="text-xs">{court.sport_type}</Badge>
                        
                        {court.rating > 0 && (
                          <div className="flex items-center text-xs sm:text-sm">
                            <Star className="mr-1 h-3 w-3 sm:h-4 sm:w-4 fill-yellow-400 text-yellow-400" />
                            <span className="font-medium">{court.rating.toFixed(1)}</span>
                            <span className="ml-1 text-muted-foreground">
                              ({court.reviews_count})
                            </span>
                          </div>
                        )}
                        
                        <div className="flex items-center text-xs sm:text-sm text-muted-foreground">
                          <Clock className="mr-1 h-3 w-3 sm:h-4 sm:w-4" />
                          <span>
                            {formatTime(resolved.opening_time)} - {formatTime(resolved.closing_time)}
                          </span>
                        </div>
                        
                        <p className="text-base sm:text-lg font-bold">{formatPrice(court.base_price)}/hr</p>
                      </div>
                    </CardContent>
                    
                    <CardFooter className="p-3 sm:p-4 pt-0">
                      <Button
                        className="w-full h-9 sm:h-10 text-sm"
                        onClick={() => navigate(`/courts/${court.slug}`)}
                      >
                        Book Now
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
