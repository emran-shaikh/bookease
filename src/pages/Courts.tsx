import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, Star, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Court {
  id: string;
  name: string;
  description: string;
  sport_type: string;
  location: string;
  city: string;
  base_price: number;
  images: string[];
  rating?: number;
  reviews_count?: number;
}

export default function Courts() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchCourts();
  }, []);

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
        
        return {
          ...court,
          rating: avgRating,
          reviews_count: ratings.length,
        };
      });

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

  const filteredCourts = courts.filter(court =>
    court.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    court.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    court.sport_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8">
        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold">Browse Courts</h1>
          <p className="text-muted-foreground">Find and book sports venues near you</p>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, city, or sport..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourts.map((court) => (
            <Card key={court.id} className="overflow-hidden transition-shadow hover:shadow-lg">
              <div className="aspect-video w-full overflow-hidden bg-muted">
                {court.images && court.images.length > 0 ? (
                  <img
                    src={court.images[0]}
                    alt={court.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No image
                  </div>
                )}
              </div>
              <CardHeader>
                <CardTitle className="line-clamp-1">{court.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {court.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Badge variant="secondary">{court.sport_type}</Badge>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-1 h-4 w-4" />
                    {court.city}, {court.location}
                  </div>
                  {court.rating > 0 && (
                    <div className="flex items-center text-sm">
                      <Star className="mr-1 h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{court.rating.toFixed(1)}</span>
                      <span className="ml-1 text-muted-foreground">
                        ({court.reviews_count} reviews)
                      </span>
                    </div>
                  )}
                  <p className="text-lg font-bold">${court.base_price}/hour</p>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  onClick={() => navigate(`/courts/${court.id}`)}
                >
                  View Details & Book
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
