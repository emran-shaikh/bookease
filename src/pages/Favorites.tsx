import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SEO } from '@/components/SEO';
import { Heart, MapPin, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { formatPrice } from '@/lib/currency';

interface Court {
  id: string;
  slug: string;
  name: string;
  sport_type: string;
  location: string;
  city: string;
  base_price: number;
  images: string[];
  status: string;
  is_active: boolean;
}

export default function Favorites() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { favorites, toggleFavorite, isFavorite } = useFavorites(userId);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      } else {
        navigate('/auth');
      }
    };
    getUser();
  }, [navigate]);

  useEffect(() => {
    if (userId && favorites.length > 0) {
      fetchFavoriteCourts();
    } else if (userId) {
      setLoading(false);
      setCourts([]);
    }
  }, [userId, favorites]);

  const fetchFavoriteCourts = async () => {
    try {
      const { data, error } = await supabase
        .from('courts')
        .select('*')
        .in('id', favorites)
        .eq('is_active', true)
        .eq('status', 'approved');

      if (error) throw error;
      setCourts(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title="My Favorite Courts"
        description="View and manage your favorite sports courts. Get quick access to your preferred venues and receive updates on special offers."
        keywords="favorite courts, saved venues, preferred courts"
      />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 text-foreground">My Favorite Courts</h1>
          <p className="text-muted-foreground">Manage your favorite courts and get notified about special offers</p>
        </div>

        {courts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Heart className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2 text-foreground">No favorites yet</h3>
              <p className="text-muted-foreground mb-4">Start adding courts to your favorites to see them here</p>
              <Button onClick={() => navigate('/courts')}>Browse Courts</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courts.map((court) => (
              <Card key={court.id} className="hover:shadow-lg transition-shadow cursor-pointer group">
                <CardHeader className="p-0 relative">
                  <div className="aspect-video relative overflow-hidden rounded-t-lg">
                    <img
                      src={court.images?.[0] || '/placeholder.svg'}
                      alt={court.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onClick={() => navigate(`/courts/${court.slug}`)}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder.svg';
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 bg-background/80 hover:bg-background"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(court.id);
                      }}
                    >
                      <Heart
                        className={`h-5 w-5 ${
                          isFavorite(court.id) ? 'fill-red-500 text-red-500' : 'text-foreground'
                        }`}
                      />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4" onClick={() => navigate(`/courts/${court.slug}`)}>
                  <CardTitle className="mb-2 text-foreground">{court.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mb-3">
                    <MapPin className="h-4 w-4" />
                    {court.city}
                  </CardDescription>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{court.sport_type}</Badge>
                    <div className="text-lg font-semibold text-primary">
                      {formatPrice(court.base_price)}/hr
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
