import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useFavorites = (userId: string | undefined) => {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    fetchFavorites();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('favorites-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'favorites',
          filter: `user_id=eq.${userId}`
        },
        () => {
          fetchFavorites();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchFavorites = async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('court_id')
        .eq('user_id', userId);

      if (error) throw error;
      setFavorites(data?.map(f => f.court_id) || []);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (courtId: string) => {
    if (!userId) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to save favorites",
        variant: "destructive",
      });
      return;
    }

    const isFavorited = favorites.includes(courtId);

    try {
      if (isFavorited) {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('court_id', courtId);

        if (error) throw error;

        toast({
          title: "Removed from favorites",
          description: "Court removed from your favorites",
        });
      } else {
        const { error } = await supabase
          .from('favorites')
          .insert({ user_id: userId, court_id: courtId });

        if (error) throw error;

        toast({
          title: "Added to favorites",
          description: "Court added to your favorites",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const isFavorite = (courtId: string) => favorites.includes(courtId);

  return { favorites, loading, toggleFavorite, isFavorite };
};
