import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/SEO';
import { Header } from '@/components/Header';
import Footer from '@/components/Footer';
import { getSportIcon } from '@/lib/sport-icons';

interface SportStats {
  sport_type: string;
  venue_count: number;
  court_count: number;
  min_price: number;
}

export default function Sports() {
  const navigate = useNavigate();
  const [sports, setSports] = useState<SportStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSports();
  }, []);

  const fetchSports = async () => {
    try {
      const { data: courts, error } = await supabase
        .from('courts')
        .select('sport_type, base_price, venue_id')
        .eq('status', 'approved')
        .eq('is_active', true);

      if (error) throw error;

      // Aggregate stats by sport type
      const sportMap = new Map<string, { venues: Set<string>; courts: number; minPrice: number }>();

      (courts || []).forEach(court => {
        const existing = sportMap.get(court.sport_type) || { 
          venues: new Set<string>(), 
          courts: 0, 
          minPrice: Infinity 
        };
        
        if (court.venue_id) {
          existing.venues.add(court.venue_id);
        }
        existing.courts += 1;
        existing.minPrice = Math.min(existing.minPrice, court.base_price);
        
        sportMap.set(court.sport_type, existing);
      });

      const sportStats: SportStats[] = Array.from(sportMap.entries()).map(([sport_type, stats]) => ({
        sport_type,
        venue_count: stats.venues.size,
        court_count: stats.courts,
        min_price: stats.minPrice === Infinity ? 0 : stats.minPrice,
      }));

      // Sort by court count descending
      sportStats.sort((a, b) => b.court_count - a.court_count);

      setSports(sportStats);
    } catch (error) {
      console.error('Error fetching sports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSportClick = (sportType: string) => {
    navigate(`/sports/${encodeURIComponent(sportType.toLowerCase())}`);
  };

  const sportBackgrounds: Record<string, string> = {
    'Cricket': 'from-green-500/20 to-green-600/10',
    'Futsal': 'from-orange-500/20 to-orange-600/10',
    'Football': 'from-emerald-500/20 to-emerald-600/10',
    'Padel': 'from-blue-500/20 to-blue-600/10',
    'Tennis': 'from-yellow-500/20 to-yellow-600/10',
    'Badminton': 'from-red-500/20 to-red-600/10',
    'Basketball': 'from-orange-500/20 to-orange-600/10',
    'Volleyball': 'from-purple-500/20 to-purple-600/10',
    'Squash': 'from-cyan-500/20 to-cyan-600/10',
    'Table Tennis': 'from-red-500/20 to-red-600/10',
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title="Browse Sports - Find Courts by Sport Type | BookedHours"
        description="Explore sports courts by type. Cricket, Futsal, Badminton, Tennis, and more. Find venues and book courts for your favorite sport."
        keywords="sports courts, cricket courts, futsal courts, badminton courts, tennis courts, sports booking"
      />
      <Header />
      
      <main className="container py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            Browse by Sport
          </h1>
          <p className="text-muted-foreground">
            Select a sport to find venues and courts available near you
          </p>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <Skeleton className="h-16 w-16 rounded-full mx-auto mb-4" />
                  <Skeleton className="h-6 w-24 mx-auto mb-2" />
                  <Skeleton className="h-4 w-32 mx-auto" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : sports.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">No sports available at the moment</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {sports.map((sport) => (
              <Card 
                key={sport.sport_type}
                className={`group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-gradient-to-br ${sportBackgrounds[sport.sport_type] || 'from-primary/20 to-primary/10'}`}
                onClick={() => handleSportClick(sport.sport_type)}
              >
                <CardContent className="p-6 text-center">
                  <div className="text-5xl sm:text-6xl mb-4 transition-transform duration-300 group-hover:scale-110">
                    {getSportIcon(sport.sport_type)}
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-foreground mb-2">
                    {sport.sport_type}
                  </h2>
                  <div className="space-y-1">
                    <Badge variant="secondary" className="text-xs">
                      {sport.venue_count} {sport.venue_count === 1 ? 'venue' : 'venues'}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {sport.court_count} {sport.court_count === 1 ? 'court' : 'courts'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
