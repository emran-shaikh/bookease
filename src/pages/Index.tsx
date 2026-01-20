import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Calendar, MapPin, Clock, Shield, Search, Star, TrendingUp, Building2, LayoutGrid, Map } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatPrice } from '@/lib/currency';
import { formatCourtCount, getUniqueSportTypes, getLowestPrice } from '@/lib/venue-utils';
import { formatSportWithIcon } from '@/lib/sport-icons';
import { SEO } from '@/components/SEO';
import Footer from '@/components/Footer';
import MapView from '@/components/MapView';
import heroImage from '@/assets/hero-sports.jpg';
import tennisImage from '@/assets/tennis-court.jpg';
import basketballImage from '@/assets/basketball-court.jpg';
import badmintonImage from '@/assets/badminton-court.jpg';

interface Court {
  id: string;
  slug: string;
  name: string;
  location: string;
  city: string;
  base_price: number;
  sport_type: string;
  images: string[] | null;
  latitude: number | null;
  longitude: number | null;
  venue_id: string | null;
  distance?: number;
  status: string;
  is_active: boolean;
  booking_count?: number;
  average_rating?: number;
  review_count?: number;
}

interface Venue {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  city: string;
  location: string;
  images: string[] | null;
  latitude: number | null;
  longitude: number | null;
  courts: Court[];
  distance?: number;
}

const sportImages: { [key: string]: string } = {
  tennis: tennisImage,
  basketball: basketballImage,
  badminton: badmintonImage,
};

export default function Index() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [venues, setVenues] = useState<Venue[]>([]);
  const [standaloneCourts, setStandaloneCourts] = useState<Court[]>([]);
  const [filteredVenues, setFilteredVenues] = useState<Venue[]>([]);
  const [filteredStandaloneCourts, setFilteredStandaloneCourts] = useState<Court[]>([]);
  const [popularItems, setPopularItems] = useState<(Venue | Court)[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [maxPrice, setMaxPrice] = useState(0);
  const [priceRange, setPriceRange] = useState([0, 0]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  // Get user location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(location);
          console.log('User location detected:', location);
        },
        (error) => {
          console.log('Geolocation error:', error.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [userLocation]);

  const fetchData = async () => {
    try {
      // Fetch all approved venues
      const { data: venuesData, error: venuesError } = await supabase
        .from('venues')
        .select('*')
        .eq('status', 'approved')
        .eq('is_active', true);

      if (venuesError) throw venuesError;

      // Fetch all approved courts
      const { data: courtsData, error: courtsError } = await supabase
        .from('courts')
        .select('*')
        .eq('status', 'approved')
        .eq('is_active', true);

      if (courtsError) throw courtsError;

      // Separate courts into venue courts and standalone courts
      const venueCourts = (courtsData || []).filter(c => c.venue_id);
      const standalone = (courtsData || []).filter(c => !c.venue_id);

      // Map courts to venues
      const venuesWithCourts: Venue[] = (venuesData || []).map(venue => ({
        ...venue,
        courts: venueCourts.filter(c => c.venue_id === venue.id),
      })).filter(v => v.courts.length > 0); // Only show venues with courts

      // Calculate distance for venues
      let processedVenues: Venue[] = venuesWithCourts;
      if (userLocation) {
        processedVenues = venuesWithCourts.map(venue => ({
          ...venue,
          distance: venue.latitude && venue.longitude 
            ? calculateDistance(userLocation.lat, userLocation.lng, venue.latitude, venue.longitude)
            : Infinity
        }));
        processedVenues.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      }

      // Calculate distance for standalone courts
      let processedStandalone: Court[] = standalone.map(c => ({ ...c, distance: undefined }));
      if (userLocation) {
        processedStandalone = standalone.map(court => ({
          ...court,
          distance: court.latitude && court.longitude 
            ? calculateDistance(userLocation.lat, userLocation.lng, court.latitude, court.longitude)
            : Infinity
        }));
        processedStandalone.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      }

      // Calculate max price from all courts
      const allCourts = [...venueCourts, ...standalone];
      const calculatedMaxPrice = allCourts.length > 0 
        ? Math.max(...allCourts.map(c => c.base_price))
        : 0;
      setMaxPrice(calculatedMaxPrice);
      setPriceRange([0, calculatedMaxPrice]);
      
      setVenues(processedVenues);
      setStandaloneCourts(processedStandalone);
      setFilteredVenues(processedVenues);
      setFilteredStandaloneCourts(processedStandalone);

      // Fetch popular items (venues with most bookings)
      await fetchPopularItems(processedVenues, processedStandalone);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load venues and courts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPopularItems = async (venuesList: Venue[], standaloneList: Court[]) => {
    try {
      // Get booking counts for all courts
      const allCourtIds = [
        ...venuesList.flatMap(v => v.courts.map(c => c.id)),
        ...standaloneList.map(c => c.id)
      ];

      const venueStats = await Promise.all(
        venuesList.slice(0, 6).map(async (venue) => {
          let totalBookings = 0;
          let totalRating = 0;
          let totalReviews = 0;

          for (const court of venue.courts) {
            const { data: countData } = await supabase
              .rpc('get_court_booking_count', { court_uuid: court.id });
            totalBookings += countData || 0;

            const { data: reviewsData } = await supabase
              .from('reviews')
              .select('rating')
              .eq('court_id', court.id);

            if (reviewsData && reviewsData.length > 0) {
              totalRating += reviewsData.reduce((acc, r) => acc + r.rating, 0);
              totalReviews += reviewsData.length;
            }
          }

          return {
            item: venue,
            type: 'venue' as const,
            booking_count: totalBookings,
            average_rating: totalReviews > 0 ? totalRating / totalReviews : 0,
            review_count: totalReviews,
          };
        })
      );

      const courtStats = await Promise.all(
        standaloneList.slice(0, 4).map(async (court) => {
          const { data: countData } = await supabase
            .rpc('get_court_booking_count', { court_uuid: court.id });

          const { data: reviewsData } = await supabase
            .from('reviews')
            .select('rating')
            .eq('court_id', court.id);

          const averageRating = reviewsData && reviewsData.length > 0
            ? reviewsData.reduce((acc, r) => acc + r.rating, 0) / reviewsData.length
            : 0;

          return {
            item: { ...court, booking_count: countData || 0, average_rating: averageRating, review_count: reviewsData?.length || 0 },
            type: 'court' as const,
            booking_count: countData || 0,
            average_rating: averageRating,
            review_count: reviewsData?.length || 0,
          };
        })
      );

      // Combine and sort by popularity
      const allItems = [...venueStats, ...courtStats]
        .sort((a, b) => {
          const scoreA = (a.booking_count || 0) * 2 + (a.average_rating || 0);
          const scoreB = (b.booking_count || 0) * 2 + (b.average_rating || 0);
          return scoreB - scoreA;
        })
        .slice(0, 6)
        .map(s => s.item);

      setPopularItems(allItems);
    } catch (error) {
      console.error('Error fetching popular items:', error);
    }
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  useEffect(() => {
    // Filter venues
    let filteredV = venues;
    let filteredS = standaloneCourts;

    if (searchQuery) {
      filteredV = filteredV.filter(venue =>
        venue.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        venue.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        venue.city.toLowerCase().includes(searchQuery.toLowerCase())
      );
      filteredS = filteredS.filter(court =>
        court.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (court.location || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (court.city || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedSport !== 'all') {
      filteredV = filteredV.filter(venue => 
        venue.courts.some(c => c.sport_type === selectedSport)
      );
      filteredS = filteredS.filter(court => court.sport_type === selectedSport);
    }

    if (selectedLocation !== 'all') {
      filteredV = filteredV.filter(venue => venue.city === selectedLocation);
      filteredS = filteredS.filter(court => court.city === selectedLocation);
    }

    // Price filter for venues (check if any court is in range)
    filteredV = filteredV.filter(venue => 
      venue.courts.some(c => c.base_price >= priceRange[0] && c.base_price <= priceRange[1])
    );
    filteredS = filteredS.filter(court => 
      court.base_price >= priceRange[0] && court.base_price <= priceRange[1]
    );

    // Maintain distance-based sorting after filtering
    if (userLocation) {
      filteredV.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      filteredS.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }

    setFilteredVenues(filteredV);
    setFilteredStandaloneCourts(filteredS);
  }, [searchQuery, selectedSport, selectedLocation, priceRange, venues, standaloneCourts, userLocation]);

  // Get unique values for filters
  const uniqueCities = Array.from(new Set([
    ...venues.map(v => v.city),
    ...standaloneCourts.map(c => c.city).filter(Boolean)
  ]));
  const uniqueSports = Array.from(new Set([
    ...venues.flatMap(v => v.courts.map(c => c.sport_type)),
    ...standaloneCourts.map(c => c.sport_type)
  ]));

  const handleVenueClick = (venueSlug: string) => {
    navigate(`/venues/${venueSlug}`);
  };

  const handleCourtClick = (courtSlug: string) => {
    navigate(`/courts/${courtSlug}`);
  };

  const isVenue = (item: Venue | Court): item is Venue => {
    return 'courts' in item;
  };

  const totalResults = filteredVenues.length + filteredStandaloneCourts.length;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <SEO 
        title="Indoor Court Booking Karachi | Cricket, Futsal, Badminton - BookedHours"
        description="Book indoor sports courts online in Karachi. Indoor cricket court booking, futsal ground booking, badminton court reservation. Real-time availability, instant confirmation."
        keywords="indoor court booking, book indoor sports court, indoor cricket court booking, indoor futsal court booking, indoor badminton court booking, indoor tennis court booking, sports court reservation, online court booking system, indoor court booking in Karachi, cricket indoor academy Karachi, futsal ground booking Karachi, badminton court booking Karachi"
        canonical="https://bookedhours.com"
      />
      {/* Hero Section */}
      <div className="relative h-[60vh] sm:h-[65vh] md:h-[70vh] overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
        </div>
        
        <header className="container relative z-10 flex h-16 sm:h-20 items-center justify-between px-4">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="rounded-lg bg-primary/10 p-1.5 sm:p-2 backdrop-blur-sm">
              <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">BookedHours</span>
          </div>
          <Button size="default" asChild className="shadow-lg hover:shadow-xl transition-all duration-300 text-sm sm:text-base">
            <a href="/auth">Get Started</a>
          </Button>
        </header>

        <div className="container relative z-10 flex flex-col items-center justify-center space-y-4 sm:space-y-6 md:space-y-8 pt-8 sm:pt-12 md:pt-16 text-center px-4">
          <div className="space-y-3 sm:space-y-4 md:space-y-6 animate-fade-in">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-foreground leading-tight">
              Indoor Court Booking
              <br />
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Cricket, Futsal, Badminton
              </span>
            </h1>
            <p className="mx-auto max-w-xl md:max-w-2xl text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground leading-relaxed px-2">
              Find and book sports venues near you. Browse venues with multiple courts
              or individual courts with real-time availability.
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter Section */}
      <main className="container -mt-8 sm:-mt-12 md:-mt-16 relative z-20 px-4">
        <Card className="mb-8 sm:mb-10 md:mb-12 shadow-2xl border-2">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-lg sm:text-xl md:text-2xl">Find Your Perfect Venue</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Search sports venues and courts near you</CardDescription>
              </div>
              <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as 'grid' | 'map')} className="bg-muted p-1 rounded-lg">
                <ToggleGroupItem value="grid" aria-label="Grid view" className="data-[state=on]:bg-background data-[state=on]:shadow-sm px-3">
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Grid</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="map" aria-label="Map view" className="data-[state=on]:bg-background data-[state=on]:shadow-sm px-3">
                  <Map className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Map</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0 sm:pt-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              <Input
                placeholder="Search venues or courts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 sm:pl-10 h-10 sm:h-12 text-sm sm:text-base"
              />
            </div>

            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-xs sm:text-sm font-medium text-foreground">Sport Type</label>
                <Select value={selectedSport} onValueChange={setSelectedSport}>
                  <SelectTrigger className="h-10 sm:h-12 text-sm">
                    <SelectValue placeholder="All Sports" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sports</SelectItem>
                    {uniqueSports.map(sport => (
                      <SelectItem key={sport} value={sport}>
                        {sport.charAt(0).toUpperCase() + sport.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-xs sm:text-sm font-medium text-foreground">Location</label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger className="h-10 sm:h-12 text-sm">
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {uniqueCities.map(city => (
                      <SelectItem key={city} value={city}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:space-y-2 sm:col-span-2 lg:col-span-1">
                <label className="text-xs sm:text-sm font-medium text-foreground flex items-center gap-2">
                  Price: {formatPrice(priceRange[0])} - {formatPrice(priceRange[1])}
                </label>
                <Slider
                  value={priceRange}
                  onValueChange={setPriceRange}
                  min={0}
                  max={maxPrice || 100}
                  step={Math.max(1, Math.floor(maxPrice / 20)) || 5}
                  className="pt-3 sm:pt-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Map View */}
        {viewMode === 'map' && (
          <section className="pb-8 sm:pb-12">
            <MapView
              venues={filteredVenues}
              courts={filteredStandaloneCourts}
              userLocation={userLocation}
              className="h-[500px] sm:h-[600px]"
            />
            <p className="text-xs text-muted-foreground text-center mt-3">
              Showing {filteredVenues.length} venues and {filteredStandaloneCourts.length} courts on map
            </p>
          </section>
        )}

        {/* Venues Section - Grid View */}
        {viewMode === 'grid' && filteredVenues.length > 0 && (
          <section className="pb-8 sm:pb-12">
            <div className="mb-4 sm:mb-6 md:mb-8 flex items-center gap-2 sm:gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Sports Venues</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {filteredVenues.length} {filteredVenues.length === 1 ? 'venue' : 'venues'} with multiple courts
                  {userLocation && ' • Sorted by distance'}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredVenues.map((venue) => {
                const sportTypes = getUniqueSportTypes(venue.courts);
                const lowestPrice = getLowestPrice(venue.courts);
                const courtCount = venue.courts.length;

                return (
                  <Card 
                    key={venue.id} 
                    className="group overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                    onClick={() => handleVenueClick(venue.slug)}
                  >
                    <div className="relative h-40 sm:h-48 overflow-hidden">
                      {venue.images && venue.images.length > 0 ? (
                        <img
                          src={venue.images[0]}
                          alt={venue.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = sportImages.tennis;
                          }}
                        />
                      ) : (
                        <div className="h-full w-full bg-muted flex items-center justify-center">
                          <Building2 className="h-12 w-12 text-muted-foreground" />
                        </div>
                      )}
                      
                      {/* Venue badge */}
                      <div className="absolute top-2 sm:top-3 left-2 sm:left-3">
                        <Badge className="bg-primary/90 backdrop-blur-sm text-xs">
                          <Building2 className="h-3 w-3 mr-1" />
                          Venue
                        </Badge>
                      </div>
                      
                      {/* Court count badge */}
                      <div className="absolute top-2 sm:top-3 right-2 sm:right-3">
                        <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm text-xs">
                          {formatCourtCount(courtCount)}
                        </Badge>
                      </div>
                      
                      {venue.distance !== undefined && venue.distance !== Infinity && (
                        <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3">
                          <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm text-xs text-primary">
                            <MapPin className="h-3 w-3 mr-1" />
                            {venue.distance.toFixed(1)} km
                          </Badge>
                        </div>
                      )}
                    </div>
                    
                    <CardHeader className="p-3 sm:p-4">
                      <CardTitle className="line-clamp-1 text-base sm:text-lg">{venue.name}</CardTitle>
                      <CardDescription className="line-clamp-1 text-xs sm:text-sm">
                        {venue.description || 'Sports venue with multiple courts'}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="p-3 sm:p-4 pt-0">
                      {/* Sport types */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {sportTypes.slice(0, 3).map((sport) => (
                          <Badge key={sport} variant="outline" className="text-xs">
                            {formatSportWithIcon(sport)}
                          </Badge>
                        ))}
                        {sportTypes.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{sportTypes.length - 3}
                          </Badge>
                        )}
                      </div>
                      
                      {/* Location */}
                      <div className="flex items-center text-xs sm:text-sm text-muted-foreground mb-2">
                        <MapPin className="mr-1 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="truncate">{venue.city}, {venue.location}</span>
                      </div>
                    </CardContent>
                    
                    <CardFooter className="flex justify-between items-center p-3 sm:p-4 pt-0">
                      <div className="flex items-center gap-1 text-base sm:text-lg font-bold">
                        From {formatPrice(lowestPrice)}
                        <span className="text-xs sm:text-sm font-normal text-muted-foreground">/hr</span>
                      </div>
                      <Button variant="outline" size="sm" className="text-xs sm:text-sm h-8 sm:h-9">
                        View Courts
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Standalone Courts Section - Grid View */}
        {viewMode === 'grid' && filteredStandaloneCourts.length > 0 && (
          <section className="pb-8 sm:pb-12 md:pb-16">
            <div className="mb-4 sm:mb-6 md:mb-8">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-1 sm:mb-2">Individual Courts</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {filteredStandaloneCourts.length} standalone {filteredStandaloneCourts.length === 1 ? 'court' : 'courts'}
                {userLocation && ' • Sorted by distance'}
              </p>
            </div>

            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filteredStandaloneCourts.map((court) => (
                <Card 
                  key={court.id} 
                  className="group overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                  onClick={() => handleCourtClick(court.slug)}
                >
                  <div className="relative h-40 sm:h-48 overflow-hidden">
                    <img
                      src={court.images?.[0] || sportImages[court.sport_type.toLowerCase()] || sportImages.tennis}
                      alt={court.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = sportImages[court.sport_type.toLowerCase()] || sportImages.tennis;
                      }}
                    />
                    <div className="absolute top-2 sm:top-3 right-2 sm:right-3">
                      <Badge className="bg-primary/90 backdrop-blur-sm text-xs">
                        {court.sport_type}
                      </Badge>
                    </div>
                    {court.distance !== undefined && court.distance !== Infinity && (
                      <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3">
                        <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm text-xs text-primary">
                          <MapPin className="h-3 w-3 mr-1" />
                          {court.distance.toFixed(1)} km
                        </Badge>
                      </div>
                    )}
                  </div>
                  <CardHeader className="p-3 sm:p-4">
                    <CardTitle className="line-clamp-1 text-base sm:text-lg">{court.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1 text-xs sm:text-sm">
                      <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />
                      {court.city || court.location}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="flex justify-between items-center p-3 sm:p-4 pt-0">
                    <div className="flex items-center gap-1 text-base sm:text-lg font-bold">
                      {formatPrice(court.base_price)}
                      <span className="text-xs sm:text-sm font-normal text-muted-foreground">/hr</span>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs sm:text-sm h-8 sm:h-9">
                      View
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* No Results - Grid View */}
        {viewMode === 'grid' && (
          loading ? (
            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 pb-8">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Card key={i} className="animate-pulse">
                  <div className="h-40 sm:h-48 bg-muted" />
                  <CardHeader className="p-3 sm:p-4">
                    <div className="h-5 sm:h-6 bg-muted rounded w-3/4" />
                    <div className="h-3 sm:h-4 bg-muted rounded w-1/2 mt-2" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : totalResults === 0 ? (
            <Card className="p-8 sm:p-12 text-center mb-8">
              <MapPin className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-muted-foreground mb-3 sm:mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold mb-1 sm:mb-2">No venues or courts found</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">Try adjusting your filters to see more results</p>
            </Card>
          ) : null
        )}

        {/* Popular Section */}
        {popularItems.length > 0 && (
          <section className="pb-8 sm:pb-12 md:pb-16">
            <div className="mb-4 sm:mb-6 md:mb-8 flex items-center gap-2 sm:gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">Popular Venues</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">Top-rated and most-booked locations</p>
              </div>
            </div>

            <Carousel
              opts={{
                align: "start",
                loop: true,
              }}
              className="w-full"
            >
              <CarouselContent className="-ml-2 md:-ml-4">
                {popularItems.map((item, index) => (
                  <CarouselItem key={isVenue(item) ? item.id : item.id} className="pl-2 md:pl-4 basis-[85%] sm:basis-1/2 lg:basis-1/3">
                    {isVenue(item) ? (
                      <Card 
                        className="group overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 cursor-pointer border-2"
                        onClick={() => handleVenueClick(item.slug)}
                      >
                        <div className="relative h-44 sm:h-56 overflow-hidden">
                          {item.images && item.images.length > 0 ? (
                            <img
                              src={item.images[0]}
                              alt={item.name}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = sportImages.tennis;
                              }}
                            />
                          ) : (
                            <div className="h-full w-full bg-muted flex items-center justify-center">
                              <Building2 className="h-12 w-12 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
                          
                          <div className="absolute top-2 sm:top-3 left-2 sm:left-3">
                            <Badge className="bg-primary/90 backdrop-blur-sm shadow-lg text-xs">
                              <Building2 className="h-3 w-3 mr-1" />
                              Venue
                            </Badge>
                          </div>
                          
                          <div className="absolute top-2 sm:top-3 right-2 sm:right-3">
                            <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm text-xs">
                              {formatCourtCount(item.courts.length)}
                            </Badge>
                          </div>
                        </div>

                        <CardHeader className="p-3 sm:p-4">
                          <CardTitle className="line-clamp-1 text-base sm:text-xl">{item.name}</CardTitle>
                          <CardDescription className="flex items-center gap-1 text-xs sm:text-sm">
                            <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />
                            {item.city}
                          </CardDescription>
                        </CardHeader>

                        <CardFooter className="flex justify-between items-center p-3 sm:p-4 pt-0">
                          <div className="flex items-center gap-1 text-base sm:text-xl font-bold text-primary">
                            From {formatPrice(getLowestPrice(item.courts))}
                            <span className="text-xs sm:text-sm font-normal text-muted-foreground">/hr</span>
                          </div>
                        </CardFooter>
                      </Card>
                    ) : (
                      <Card 
                        className="group overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 cursor-pointer border-2"
                        onClick={() => handleCourtClick(item.slug)}
                      >
                        <div className="relative h-44 sm:h-56 overflow-hidden">
                          <img
                            src={item.images?.[0] || sportImages[item.sport_type.toLowerCase()] || sportImages.tennis}
                            alt={item.name}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = sportImages[item.sport_type.toLowerCase()] || sportImages.tennis;
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
                          
                          <div className="absolute top-2 sm:top-3 right-2 sm:right-3">
                            <Badge className="bg-primary/90 backdrop-blur-sm shadow-lg text-xs">
                              {item.sport_type}
                            </Badge>
                          </div>

                          {(item as Court).average_rating && (item as Court).average_rating! > 0 && (
                            <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3">
                              <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm shadow-lg text-xs">
                                <Star className="h-3 w-3 mr-1 fill-amber-400 text-amber-400" />
                                {(item as Court).average_rating!.toFixed(1)} ({(item as Court).review_count})
                              </Badge>
                            </div>
                          )}
                        </div>

                        <CardHeader className="p-3 sm:p-4">
                          <CardTitle className="line-clamp-1 text-base sm:text-xl">{item.name}</CardTitle>
                          <CardDescription className="flex items-center gap-1 text-xs sm:text-sm">
                            <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />
                            {item.city}
                          </CardDescription>
                        </CardHeader>

                        <CardFooter className="flex justify-between items-center p-3 sm:p-4 pt-0">
                          <div className="flex items-center gap-1 text-base sm:text-xl font-bold text-primary">
                            {formatPrice(item.base_price)}
                            <span className="text-xs sm:text-sm font-normal text-muted-foreground">/hr</span>
                          </div>
                          {(item as Court).booking_count !== undefined && (item as Court).booking_count! > 0 && (
                            <Badge variant="outline" className="text-[10px] sm:text-xs">
                              {(item as Court).booking_count} bookings
                            </Badge>
                          )}
                        </CardFooter>
                      </Card>
                    )}
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="hidden sm:flex left-0 -translate-x-1/2" />
              <CarouselNext className="hidden sm:flex right-0 translate-x-1/2" />
            </Carousel>
          </section>
        )}

        {/* Features Section */}
        <section className="grid gap-4 sm:gap-6 md:gap-8 pt-4 sm:pt-6 md:pt-8 pb-8 sm:pb-12 md:pb-16 grid-cols-2 lg:grid-cols-4">
          <div className="group flex flex-col items-center space-y-2 sm:space-y-3 text-center p-4 sm:p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
            <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
              <MapPin className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            </div>
            <h3 className="text-sm sm:text-lg font-semibold">Find Nearby</h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed hidden sm:block">
              Discover top-rated venues in your area
            </p>
          </div>

          <div className="group flex flex-col items-center space-y-2 sm:space-y-3 text-center p-4 sm:p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
            <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
              <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            </div>
            <h3 className="text-sm sm:text-lg font-semibold">Real-Time</h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed hidden sm:block">
              Check live slot availability
            </p>
          </div>

          <div className="group flex flex-col items-center space-y-2 sm:space-y-3 text-center p-4 sm:p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
            <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
              <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            </div>
            <h3 className="text-sm sm:text-lg font-semibold">Easy Booking</h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed hidden sm:block">
              Book in just a few clicks
            </p>
          </div>

          <div className="group flex flex-col items-center space-y-2 sm:space-y-3 text-center p-4 sm:p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
            <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
              <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            </div>
            <h3 className="text-sm sm:text-lg font-semibold">Secure Pay</h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed hidden sm:block">
              Industry-standard encryption
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
