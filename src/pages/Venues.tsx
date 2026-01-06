import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { SEO } from '@/components/SEO';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MapPin, Search, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCourtCount, getUniqueSportTypes, getLowestPrice } from '@/lib/venue-utils';
import { formatPrice } from '@/lib/currency';

interface Venue {
  id: string;
  slug: string;
  name: string;
  description: string;
  city: string;
  state: string;
  location: string;
  images: string[];
  courts?: any[];
}

export default function Venues() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [sportFilter, setSportFilter] = useState('all');
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchVenues();
  }, []);

  async function fetchVenues() {
    try {
      // Fetch venues with their courts
      const { data: venuesData, error: venuesError } = await supabase
        .from('venues')
        .select('*')
        .eq('status', 'approved')
        .eq('is_active', true);

      if (venuesError) throw venuesError;

      // Fetch courts for each venue
      const { data: courtsData, error: courtsError } = await supabase
        .from('courts')
        .select('id, venue_id, sport_type, base_price')
        .eq('status', 'approved')
        .eq('is_active', true)
        .not('venue_id', 'is', null);

      if (courtsError) throw courtsError;

      // Map courts to venues
      const venuesWithCourts = (venuesData || []).map(venue => ({
        ...venue,
        courts: (courtsData || []).filter(court => court.venue_id === venue.id),
      }));

      setVenues(venuesWithCourts);
    } catch (error: any) {
      toast({
        title: 'Error loading venues',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Get unique cities and sport types for filters
  const cities = ['all', ...new Set(venues.map(v => v.city))];
  const allSportTypes = new Set<string>();
  venues.forEach(v => {
    v.courts?.forEach(c => {
      if (c.sport_type) allSportTypes.add(c.sport_type);
    });
  });
  const sportTypes = ['all', ...allSportTypes];

  const filteredVenues = venues.filter(venue => {
    const matchesSearch = 
      venue.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venue.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      venue.location.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCity = cityFilter === 'all' || venue.city === cityFilter;
    
    const matchesSport = sportFilter === 'all' || 
      venue.courts?.some(c => c.sport_type === sportFilter);
    
    return matchesSearch && matchesCity && matchesSport;
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title="Sports Venues | Multi-Court Indoor Sports Facilities"
        description="Discover sports venues with multiple courts for cricket, futsal, badminton and more. Book courts at indoor sports arenas near you."
        keywords="sports venue, indoor arena, multi-court facility, sports complex, court booking"
        canonical="https://bookedhours.com/venues"
      />
      <Header />
      
      <main className="container py-4 sm:py-6 md:py-8 px-4">
        <div className="mb-4 sm:mb-6 md:mb-8">
          <h1 className="mb-1 sm:mb-2 text-2xl sm:text-3xl md:text-4xl font-bold">Sports Venues</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Explore multi-court sports facilities and arenas
          </p>
        </div>

        {/* Filters */}
        <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
          <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search venues..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10 sm:h-11 text-sm"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:flex">
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="w-full lg:w-[160px] h-10 sm:h-11 text-sm">
                  <SelectValue placeholder="All Cities" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map(city => (
                    <SelectItem key={city} value={city}>
                      {city === 'all' ? 'All Cities' : city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={sportFilter} onValueChange={setSportFilter}>
                <SelectTrigger className="w-full lg:w-[160px] h-10 sm:h-11 text-sm">
                  <SelectValue placeholder="All Sports" />
                </SelectTrigger>
                <SelectContent>
                  {sportTypes.map(sport => (
                    <SelectItem key={sport} value={sport}>
                      {sport === 'all' ? 'All Sports' : sport}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Venues Grid */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredVenues.map((venue) => {
            const sportTypesInVenue = getUniqueSportTypes(venue.courts || []);
            const lowestPrice = getLowestPrice(venue.courts || []);
            const courtCount = venue.courts?.length || 0;

            return (
              <Card key={venue.id} className="overflow-hidden transition-shadow hover:shadow-lg group">
                <div className="aspect-video w-full overflow-hidden bg-muted relative">
                  {venue.images && venue.images.length > 0 ? (
                    <img
                      src={venue.images[0]}
                      alt={venue.name}
                      className="h-full w-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300"
                      onClick={() => navigate(`/venues/${venue.slug}`)}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Building2 className="h-12 w-12" />
                    </div>
                  )}
                  
                  {/* Court count badge */}
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="bg-background/90">
                      {formatCourtCount(courtCount)}
                    </Badge>
                  </div>
                </div>
                
                <CardHeader className="p-3 sm:p-4">
                  <CardTitle className="line-clamp-1 text-base sm:text-lg">{venue.name}</CardTitle>
                  <CardDescription className="line-clamp-2 text-xs sm:text-sm">
                    {venue.description || 'Sports venue with multiple courts'}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="p-3 sm:p-4 pt-0">
                  <div className="space-y-1.5 sm:space-y-2">
                    {/* Sport types */}
                    <div className="flex flex-wrap gap-1">
                      {sportTypesInVenue.slice(0, 3).map((sport) => (
                        <Badge key={sport} variant="outline" className="text-xs">
                          {sport}
                        </Badge>
                      ))}
                      {sportTypesInVenue.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{sportTypesInVenue.length - 3} more
                        </Badge>
                      )}
                    </div>
                    
                    {/* Location */}
                    <div className="flex items-center text-xs sm:text-sm text-muted-foreground">
                      <MapPin className="mr-1 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span className="truncate">{venue.city}, {venue.location}</span>
                    </div>
                    
                    {/* Starting price */}
                    {lowestPrice > 0 && (
                      <p className="text-base sm:text-lg font-bold">
                        From {formatPrice(lowestPrice)}/hr
                      </p>
                    )}
                  </div>
                </CardContent>
                
                <CardFooter className="p-3 sm:p-4 pt-0">
                  <Button
                    className="w-full h-9 sm:h-10 text-sm"
                    onClick={() => navigate(`/venues/${venue.slug}`)}
                  >
                    View Venue
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {filteredVenues.length === 0 && (
          <div className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No venues found</p>
            <Button
              variant="link"
              onClick={() => navigate('/courts')}
              className="mt-2"
            >
              Browse individual courts instead
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
