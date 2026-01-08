import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Clock, ChevronRight, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/SEO';
import { Header } from '@/components/Header';
import Footer from '@/components/Footer';
import { getSportIcon, getAmenityIcon } from '@/lib/sport-icons';
import { formatPrice } from '@/lib/currency';

interface Court {
  id: string;
  slug: string;
  name: string;
  base_price: number;
  venue_id: string | null;
}

interface Venue {
  id: string;
  slug: string;
  name: string;
  address: string;
  city: string;
  location: string;
  images: string[] | null;
  amenities: string[] | null;
  default_opening_time: string | null;
  default_closing_time: string | null;
  courts: Court[];
}

interface StandaloneCourt {
  id: string;
  slug: string;
  name: string;
  base_price: number;
  city: string | null;
  location: string | null;
  images: string[] | null;
  amenities: string[] | null;
  opening_time: string | null;
  closing_time: string | null;
}

export default function SportDetail() {
  const { sportType } = useParams<{ sportType: string }>();
  const navigate = useNavigate();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [standaloneCourts, setStandaloneCourts] = useState<StandaloneCourt[]>([]);
  const [loading, setLoading] = useState(true);

  const decodedSportType = sportType ? decodeURIComponent(sportType) : '';
  const displaySportType = decodedSportType.charAt(0).toUpperCase() + decodedSportType.slice(1);

  useEffect(() => {
    if (sportType) {
      fetchVenuesAndCourts();
    }
  }, [sportType]);

  const fetchVenuesAndCourts = async () => {
    try {
      // Fetch all approved courts for this sport type (case-insensitive)
      const { data: courts, error } = await supabase
        .from('courts')
        .select('*')
        .eq('status', 'approved')
        .eq('is_active', true)
        .ilike('sport_type', decodedSportType);

      if (error) throw error;

      // Separate venue courts and standalone courts
      const venueCourts = (courts || []).filter(c => c.venue_id);
      const standalone = (courts || []).filter(c => !c.venue_id);

      // Get unique venue IDs
      const venueIds = [...new Set(venueCourts.map(c => c.venue_id))].filter(Boolean) as string[];

      // Fetch venue details
      if (venueIds.length > 0) {
        const { data: venueData, error: venueError } = await supabase
          .from('venues')
          .select('*')
          .in('id', venueIds)
          .eq('status', 'approved')
          .eq('is_active', true);

        if (venueError) throw venueError;

        // Map courts to venues
        const venuesWithCourts: Venue[] = (venueData || []).map(venue => ({
          ...venue,
          courts: venueCourts
            .filter(c => c.venue_id === venue.id)
            .map(c => ({
              id: c.id,
              slug: c.slug,
              name: c.name,
              base_price: c.base_price,
              venue_id: c.venue_id,
            })),
        }));

        setVenues(venuesWithCourts);
      }

      setStandaloneCourts(standalone);
    } catch (error) {
      console.error('Error fetching venues and courts:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string | null) => {
    if (!time) return null;
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const getLowestPrice = (courts: Court[]) => {
    if (courts.length === 0) return 0;
    return Math.min(...courts.map(c => c.base_price));
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title={`${displaySportType} Courts & Venues | BookedHours`}
        description={`Find and book ${displaySportType} courts at the best venues. Compare prices, amenities, and availability.`}
        keywords={`${displaySportType} courts, ${displaySportType} venues, book ${displaySportType} court, ${displaySportType} booking`}
      />
      <Header />
      
      <main className="container py-8 px-4">
        {/* Back navigation */}
        <Link 
          to="/sports" 
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Sports
        </Link>

        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <div className="text-5xl">
            {getSportIcon(displaySportType)}
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">
              {displaySportType}
            </h1>
            <p className="text-muted-foreground">
              {venues.length} {venues.length === 1 ? 'venue' : 'venues'} • {standaloneCourts.length + venues.reduce((acc, v) => acc + v.courts.length, 0)} courts
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : venues.length === 0 && standaloneCourts.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground mb-4">No venues or courts available for {displaySportType}</p>
            <Button onClick={() => navigate('/sports')}>
              Browse Other Sports
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Venues with Courts */}
            {venues.map((venue) => (
              <Card key={venue.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="flex flex-col md:flex-row">
                  {/* Venue Image */}
                  <div className="md:w-64 h-48 md:h-auto relative flex-shrink-0">
                    <img
                      src={venue.images?.[0] || '/placeholder.svg'}
                      alt={venue.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2">
                      <Badge className="bg-primary/90 backdrop-blur-sm">
                        {venue.courts.length} {venue.courts.length === 1 ? 'court' : 'courts'}
                      </Badge>
                    </div>
                  </div>

                  {/* Venue Details */}
                  <div className="flex-1 p-4 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div className="flex-1">
                        <Link 
                          to={`/venues/${venue.slug}`}
                          className="text-xl font-bold text-foreground hover:text-primary transition-colors"
                        >
                          {venue.name}
                        </Link>
                        
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <MapPin className="h-4 w-4" />
                          <span>{venue.location}, {venue.city}</span>
                        </div>

                        {(venue.default_opening_time || venue.default_closing_time) && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Clock className="h-4 w-4" />
                            <span>
                              {formatTime(venue.default_opening_time)} - {formatTime(venue.default_closing_time)}
                            </span>
                          </div>
                        )}

                        {/* Amenities */}
                        {venue.amenities && venue.amenities.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3">
                            {venue.amenities.slice(0, 5).map((amenity, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {getAmenityIcon(amenity)} {amenity}
                              </Badge>
                            ))}
                            {venue.amenities.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{venue.amenities.length - 5} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Price */}
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">From</p>
                        <p className="text-xl font-bold text-primary">
                          {formatPrice(getLowestPrice(venue.courts))}
                        </p>
                        <p className="text-xs text-muted-foreground">per hour</p>
                      </div>
                    </div>

                    {/* Courts List */}
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm font-medium text-foreground mb-2">Available Courts:</p>
                      <div className="flex flex-wrap gap-2">
                        {venue.courts.map((court) => (
                          <Button
                            key={court.id}
                            variant="outline"
                            size="sm"
                            className="group"
                            onClick={() => navigate(`/courts/${court.slug}`)}
                          >
                            {court.name}
                            <span className="ml-2 text-muted-foreground group-hover:text-foreground">
                              {formatPrice(court.base_price)}
                            </span>
                            <ChevronRight className="h-3 w-3 ml-1 opacity-50 group-hover:opacity-100" />
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}

            {/* Standalone Courts (not in a venue) */}
            {standaloneCourts.length > 0 && (
              <>
                {venues.length > 0 && (
                  <h2 className="text-xl font-bold text-foreground mt-8 mb-4">
                    Individual Courts
                  </h2>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {standaloneCourts.map((court) => (
                    <Card 
                      key={court.id}
                      className="group cursor-pointer overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1"
                      onClick={() => navigate(`/courts/${court.slug}`)}
                    >
                      <div className="h-40 relative">
                        <img
                          src={court.images?.[0] || '/placeholder.svg'}
                          alt={court.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">
                          {court.name}
                        </h3>
                        {(court.location || court.city) && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3" />
                            <span>{court.location || court.city}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          <p className="text-lg font-bold text-primary">
                            {formatPrice(court.base_price)}
                          </p>
                          <Button size="sm" variant="ghost" className="group-hover:bg-primary group-hover:text-primary-foreground">
                            Book <ChevronRight className="h-3 w-3 ml-1" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
