import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Clock, Shield, Search, DollarSign, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import heroImage from '@/assets/hero-sports.jpg';
import tennisImage from '@/assets/tennis-court.jpg';
import basketballImage from '@/assets/basketball-court.jpg';
import badmintonImage from '@/assets/badminton-court.jpg';

interface Court {
  id: string;
  name: string;
  location: string;
  city: string;
  base_price: number;
  sport_type: string;
  images: string[] | null;
  latitude: number | null;
  longitude: number | null;
  distance?: number;
  status: string;
  is_active: boolean;
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
  
  const [courts, setCourts] = useState<Court[]>([]);
  const [filteredCourts, setFilteredCourts] = useState<Court[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [priceRange, setPriceRange] = useState([0, 200]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      navigate('/courts');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.log('Geolocation error:', error);
        }
      );
    }
  }, []);

  useEffect(() => {
    fetchCourts();
  }, []);

  const fetchCourts = async () => {
    try {
      const { data, error } = await supabase
        .from('courts')
        .select('*')
        .eq('status', 'approved')
        .eq('is_active', true);

      if (error) throw error;

      let courtsWithDistance = data || [];

      if (userLocation) {
        courtsWithDistance = courtsWithDistance.map(court => ({
          ...court,
          distance: court.latitude && court.longitude 
            ? calculateDistance(userLocation.lat, userLocation.lng, court.latitude, court.longitude)
            : undefined
        })).sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
      }

      setCourts(courtsWithDistance);
      setFilteredCourts(courtsWithDistance);
    } catch (error) {
      console.error('Error fetching courts:', error);
      toast({
        title: "Error",
        description: "Failed to load courts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
    let filtered = courts;

    if (searchQuery) {
      filtered = filtered.filter(court =>
        court.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        court.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        court.city.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedSport !== 'all') {
      filtered = filtered.filter(court => court.sport_type === selectedSport);
    }

    if (selectedLocation !== 'all') {
      filtered = filtered.filter(court => court.city === selectedLocation);
    }

    filtered = filtered.filter(court => 
      court.base_price >= priceRange[0] && court.base_price <= priceRange[1]
    );

    setFilteredCourts(filtered);
  }, [searchQuery, selectedSport, selectedLocation, priceRange, courts]);

  const uniqueCities = Array.from(new Set(courts.map(court => court.city)));
  const uniqueSports = Array.from(new Set(courts.map(court => court.sport_type)));

  const handleCourtClick = (courtId: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in or sign up to view court details and book",
      });
      navigate('/auth');
    } else {
      navigate(`/courts/${courtId}`);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Hero Section */}
      <div className="relative h-[70vh] overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
        </div>
        
        <header className="container relative z-10 flex h-20 items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="rounded-lg bg-primary/10 p-2 backdrop-blur-sm">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-foreground">CourtBook</span>
          </div>
          <Button size="lg" asChild className="shadow-lg hover:shadow-xl transition-all duration-300">
            <a href="/auth">Get Started</a>
          </Button>
        </header>

        <div className="container relative z-10 flex flex-col items-center justify-center space-y-8 pt-16 text-center">
          <div className="space-y-6 animate-fade-in">
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl text-foreground">
              Book Sports Venues
              <br />
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Anytime, Anywhere
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl leading-relaxed">
              Find and book sports courts near you. From tennis to basketball,
              we've got you covered with real-time availability and instant booking.
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter Section */}
      <main className="container -mt-16 relative z-20">
        <Card className="mb-12 shadow-2xl border-2">
          <CardHeader>
            <CardTitle className="text-2xl">Find Your Perfect Court</CardTitle>
            <CardDescription>Search and filter available sports venues near you</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search courts by name or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-lg"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Sport Type</label>
                <Select value={selectedSport} onValueChange={setSelectedSport}>
                  <SelectTrigger className="h-12">
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

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Location</label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger className="h-12">
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

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Price Range: ${priceRange[0]} - ${priceRange[1]}
                </label>
                <Slider
                  value={priceRange}
                  onValueChange={setPriceRange}
                  min={0}
                  max={200}
                  step={5}
                  className="pt-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Courts Grid */}
        <section className="pb-16">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-2">Available Courts</h2>
            <p className="text-muted-foreground">
              {filteredCourts.length} {filteredCourts.length === 1 ? 'court' : 'courts'} found
              {userLocation && ' • Sorted by distance'}
            </p>
          </div>

          {loading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Card key={i} className="animate-pulse">
                  <div className="h-48 bg-muted" />
                  <CardHeader>
                    <div className="h-6 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2 mt-2" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : filteredCourts.length === 0 ? (
            <Card className="p-12 text-center">
              <MapPin className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No courts found</h3>
              <p className="text-muted-foreground">Try adjusting your filters to see more results</p>
            </Card>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCourts.map((court) => (
                <Card 
                  key={court.id} 
                  className="group overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                  onClick={() => handleCourtClick(court.id)}
                >
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={court.images?.[0] || sportImages[court.sport_type.toLowerCase()] || sportImages.tennis}
                      alt={court.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                    <div className="absolute top-3 right-3">
                      <Badge className="bg-primary/90 backdrop-blur-sm">
                        {court.sport_type}
                      </Badge>
                    </div>
                    {court.distance !== undefined && (
                      <div className="absolute bottom-3 left-3">
                        <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm">
                          <MapPin className="h-3 w-3 mr-1" />
                          {court.distance.toFixed(1)} km away
                        </Badge>
                      </div>
                    )}
                  </div>
                  <CardHeader>
                    <CardTitle className="line-clamp-1">{court.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {court.city}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="flex justify-between items-center">
                    <div className="flex items-center gap-1 text-lg font-bold text-primary">
                      <DollarSign className="h-5 w-5" />
                      {court.base_price}
                      <span className="text-sm font-normal text-muted-foreground">/hour</span>
                    </div>
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Features Section */}
        <section className="grid gap-8 pt-8 pb-16 sm:grid-cols-2 lg:grid-cols-4">
          <div className="group flex flex-col items-center space-y-3 text-center p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
              <MapPin className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Find Nearby Courts</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Discover top-rated venues in your area with detailed information and reviews
            </p>
          </div>

          <div className="group flex flex-col items-center space-y-3 text-center p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
              <Clock className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Real-Time Availability</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Check live slot availability and never miss your perfect time
            </p>
          </div>

          <div className="group flex flex-col items-center space-y-3 text-center p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
              <Calendar className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Easy Booking</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Book your favorite court in just a few clicks with our simple interface
            </p>
          </div>

          <div className="group flex flex-col items-center space-y-3 text-center p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Secure Payments</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Pay securely with industry-standard encryption powered by Stripe
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
