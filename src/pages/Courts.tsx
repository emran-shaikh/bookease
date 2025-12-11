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
import { Slider } from '@/components/ui/slider';
import { Loader2, MapPin, Star, Search, Navigation, Heart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { formatPrice, getCurrencySymbol } from '@/lib/currency';

interface Court {
  id: string;
  slug: string;
  name: string;
  description: string;
  sport_type: string;
  location: string;
  city: string;
  base_price: number;
  images: string[];
  latitude: number | null;
  longitude: number | null;
  rating?: number;
  reviews_count?: number;
  distance?: number;
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function Courts() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sportFilter, setSportFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [maxPrice, setMaxPrice] = useState(0);
  const [priceRange, setPriceRange] = useState([0, 0]);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [userId, setUserId] = useState<string>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { toggleFavorite, isFavorite } = useFavorites(userId);

  useEffect(() => {
    fetchCourts();
    getUserLocation();
    getUser();
  }, []);

  async function getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setUserId(user.id);
  }

  async function getUserLocation() {
    if (!navigator.geolocation) {
      setLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationLoading(false);
      },
      (error) => {
        console.log('Location access denied:', error);
        setLocationLoading(false);
      }
    );
  }

  async function fetchCourts() {
    try {
      const { data, error } = await supabase
        .from('courts')
        .select(`
          *,
          reviews (rating)
        `)
        .eq('status', 'approved')
        .eq('is_active', true);

      if (error) throw error;

      const courtsWithRatings = data.map((court: any) => {
        const ratings = court.reviews?.map((r: any) => r.rating) || [];
        const avgRating = ratings.length > 0
          ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
          : 0;
        
        let distance = undefined;
        if (userLocation && court.latitude && court.longitude) {
          distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            court.latitude,
            court.longitude
          );
        }
        
        return {
          ...court,
          rating: avgRating,
          reviews_count: ratings.length,
          distance,
        };
      });

      // Sort by distance if user location is available
      if (userLocation) {
        courtsWithRatings.sort((a, b) => {
          if (a.distance === undefined) return 1;
          if (b.distance === undefined) return -1;
          return a.distance - b.distance;
        });
      }

      // Calculate max price from courts
      const calculatedMaxPrice = courtsWithRatings.length > 0 
        ? Math.max(...courtsWithRatings.map(c => c.base_price))
        : 0;
      setMaxPrice(calculatedMaxPrice);
      setPriceRange([0, calculatedMaxPrice]);

      setCourts(courtsWithRatings);
    } catch (error: any) {
      toast({
        title: 'Error loading courts',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Get unique sport types and locations
  const sportTypes = ['all', ...new Set(courts.map(c => c.sport_type))];
  const locations = ['all', ...new Set(courts.map(c => c.city))];

  const filteredCourts = courts.filter(court => {
    const matchesSearch = 
      court.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      court.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      court.sport_type.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSport = sportFilter === 'all' || court.sport_type === sportFilter;
    const matchesLocation = locationFilter === 'all' || court.city === locationFilter;
    const matchesPrice = court.base_price >= priceRange[0] && court.base_price <= priceRange[1];
    
    return matchesSearch && matchesSport && matchesLocation && matchesPrice;
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
        title="Browse Sports Courts"
        description="Discover and book sports courts near you. Tennis, basketball, badminton and more. Filter by location, sport type, and price."
        keywords="browse courts, sports venues, court booking, tennis, basketball, badminton, Pakistan"
      />
      <Header />
      
      <main className="container py-4 sm:py-6 md:py-8 px-4">
        <div className="mb-4 sm:mb-6 md:mb-8">
          <h1 className="mb-1 sm:mb-2 text-2xl sm:text-3xl md:text-4xl font-bold">Browse Courts</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Find and book sports venues near you</p>
        </div>

        <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
          {userLocation && !locationLoading && (
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
              <Navigation className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
              <span>Showing courts near your location</span>
            </div>
          )}
          
          <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search courts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10 sm:h-11 text-sm"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:flex">
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
              
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-full lg:w-[160px] h-10 sm:h-11 text-sm">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(location => (
                    <SelectItem key={location} value={location}>
                      {location === 'all' ? 'All Locations' : location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-1.5 sm:space-y-2">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground">Price Range</span>
              <span className="font-medium">{formatPrice(priceRange[0])} - {formatPrice(priceRange[1])}</span>
            </div>
            <Slider
              value={priceRange}
              onValueChange={setPriceRange}
              min={0}
              max={maxPrice || 100}
              step={Math.max(1, Math.floor(maxPrice / 20)) || 5}
              className="w-full"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourts.map((court) => (
            <Card key={court.id} className="overflow-hidden transition-shadow hover:shadow-lg group">
              <div className="aspect-video w-full overflow-hidden bg-muted relative">
                {court.images && court.images.length > 0 ? (
                  <img
                    src={court.images[0]}
                    alt={court.name}
                    className="h-full w-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300"
                    onClick={() => navigate(`/courts/${court.slug}`)}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).parentElement?.classList.add('flex', 'items-center', 'justify-center');
                      const placeholder = document.createElement('span');
                      placeholder.textContent = 'Image unavailable';
                      placeholder.className = 'text-muted-foreground text-xs sm:text-sm';
                      (e.target as HTMLImageElement).parentElement?.appendChild(placeholder);
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-xs sm:text-sm">
                    No image
                  </div>
                )}
                {userId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 bg-background/80 hover:bg-background h-8 w-8 sm:h-9 sm:w-9"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(court.id);
                    }}
                  >
                    <Heart
                      className={`h-4 w-4 sm:h-5 sm:w-5 ${
                        isFavorite(court.id) ? 'fill-red-500 text-red-500' : 'text-foreground'
                      }`}
                    />
                  </Button>
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
                  <div className="flex items-center text-xs sm:text-sm text-muted-foreground flex-wrap">
                    <MapPin className="mr-1 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                    <span className="truncate">{court.city}, {court.location}</span>
                    {court.distance && (
                      <span className="ml-2 text-primary">• {court.distance.toFixed(1)}km</span>
                    )}
                  </div>
                  {court.rating > 0 && (
                    <div className="flex items-center text-xs sm:text-sm">
                      <Star className="mr-1 h-3 w-3 sm:h-4 sm:w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{court.rating.toFixed(1)}</span>
                      <span className="ml-1 text-muted-foreground">
                        ({court.reviews_count})
                      </span>
                    </div>
                  )}
                  <p className="text-base sm:text-lg font-bold">{formatPrice(court.base_price)}/hr</p>
                </div>
              </CardContent>
              <CardFooter className="p-3 sm:p-4 pt-0">
                <Button
                  className="w-full h-9 sm:h-10 text-sm"
                  onClick={() => navigate(`/courts/${court.slug}`)}
                >
                  View Details
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {filteredCourts.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No courts found</p>
          </div>
        )}
      </main>
    </div>
  );
}
