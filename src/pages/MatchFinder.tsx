import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Header } from '@/components/Header';
import { SEO } from '@/components/SEO';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Loader2, Users, MapPin, Calendar, Clock, Search } from 'lucide-react';

export default function MatchFinder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [joinedPostIds, setJoinedPostIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [sportFilter, setSportFilter] = useState('all');
  const [skillFilter, setSkillFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    fetchMatchData();
  }, [user?.id]);

  async function fetchMatchData() {
    try {
      setLoading(true);

      const postsQuery = supabase
        .from('match_posts')
        .select(`
          *,
          courts (name, location, city),
          venues (name)
        `)
        .in('status', ['open', 'full'])
        .order('match_date', { ascending: true })
        .order('start_time', { ascending: true });

      const [postsResponse, participantsResponse] = await Promise.all([
        postsQuery,
        user?.id
          ? supabase
              .from('match_participants')
              .select('post_id')
              .eq('user_id', user.id)
              .eq('status', 'joined')
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (postsResponse.error) throw postsResponse.error;
      if (participantsResponse?.error) throw participantsResponse.error;

      setPosts(postsResponse.data || []);
      setJoinedPostIds(new Set((participantsResponse?.data || []).map((row: any) => row.post_id)));
    } catch (error: any) {
      toast({
        title: 'Unable to load match finder',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(postId: string) {
    if (!user?.id) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to join matches.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setActionLoadingId(postId);
      const { error } = await supabase.rpc('join_match_post', {
        _post_id: postId,
        _user_id: user.id,
      });
      if (error) throw error;

      toast({ title: 'Joined match', description: 'Your slot is confirmed instantly.' });
      fetchMatchData();
    } catch (error: any) {
      toast({
        title: 'Could not join',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleLeave(postId: string) {
    if (!user?.id) return;

    try {
      setActionLoadingId(postId);
      const { error } = await supabase.rpc('leave_match_post', {
        _post_id: postId,
        _user_id: user.id,
      });
      if (error) throw error;

      toast({ title: 'Left match', description: 'You have left this match request.' });
      fetchMatchData();
    } catch (error: any) {
      toast({
        title: 'Could not leave',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setActionLoadingId(null);
    }
  }

  const cityOptions = useMemo(() => {
    const items = Array.from(new Set(posts.map((p) => p.city).filter(Boolean)));
    return ['all', ...items];
  }, [posts]);

  const sportOptions = useMemo(() => {
    const items = Array.from(new Set(posts.map((p) => p.sport_type).filter(Boolean)));
    return ['all', ...items];
  }, [posts]);

  const skillOptions = useMemo(() => {
    const items = Array.from(new Set(posts.map((p) => p.skill_level).filter(Boolean)));
    return ['all', ...items];
  }, [posts]);

  const filteredPosts = useMemo(() => {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');

    return posts.filter((post) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        q.length === 0 ||
        post.courts?.name?.toLowerCase().includes(q) ||
        post.venues?.name?.toLowerCase().includes(q) ||
        post.city?.toLowerCase().includes(q) ||
        post.sport_type?.toLowerCase().includes(q) ||
        post.host_display_name?.toLowerCase().includes(q);

      const matchesCity = cityFilter === 'all' || post.city === cityFilter;
      const matchesSport = sportFilter === 'all' || post.sport_type === sportFilter;
      const matchesSkill = skillFilter === 'all' || post.skill_level === skillFilter;

      const matchesDate =
        dateFilter === 'all' ||
        (dateFilter === 'today' && post.match_date === today) ||
        (dateFilter === 'upcoming' && post.match_date >= today);

      return matchesSearch && matchesCity && matchesSport && matchesSkill && matchesDate;
    });
  }, [posts, search, cityFilter, sportFilter, skillFilter, dateFilter]);

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Match Finder"
        description="Find players to join booked courts with instant join and smart sport/location filtering."
        keywords="match finder, find players, join game, court booking match"
      />
      <Header />

      <main className="container py-6 px-4 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">Match Finder</h1>
          <p className="text-sm text-muted-foreground">Public open matches with instant join confirmation.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Smart Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            <div className="md:col-span-2 space-y-1">
              <Label htmlFor="match-search">Search</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="match-search"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Court, venue, city, host"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>City</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              >
                {cityOptions.map((item) => (
                  <option key={item} value={item}>{item === 'all' ? 'All cities' : item}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>Sport</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={sportFilter}
                onChange={(e) => setSportFilter(e.target.value)}
              >
                {sportOptions.map((item) => (
                  <option key={item} value={item}>{item === 'all' ? 'All sports' : item}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>Skill / Date</Label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={skillFilter}
                  onChange={(e) => setSkillFilter(e.target.value)}
                >
                  {skillOptions.map((item) => (
                    <option key={item} value={item}>{item === 'all' ? 'All skills' : item}</option>
                  ))}
                </select>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                >
                  <option value="all">All dates</option>
                  <option value="today">Today</option>
                  <option value="upcoming">Upcoming</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filteredPosts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No open matches found for these filters.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredPosts.map((post) => {
              const seatsLeft = Math.max(post.needed_players - post.joined_players, 0);
              const joined = joinedPostIds.has(post.id);
              const isHost = user?.id === post.host_user_id;

              return (
                <Card key={post.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{post.courts?.name || 'Court'}</CardTitle>
                        <CardDescription>{post.venues?.name || 'Venue'} • {post.sport_type}</CardDescription>
                      </div>
                      <Badge variant={post.status === 'full' ? 'secondary' : 'default'}>
                        {post.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-1 text-sm">
                      <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{post.city || post.courts?.city || 'N/A'}</p>
                      <p className="flex items-center gap-2"><Calendar className="h-4 w-4" />{format(new Date(post.match_date), 'MMM d, yyyy')}</p>
                      <p className="flex items-center gap-2"><Clock className="h-4 w-4" />{post.start_time?.slice(0, 5)} - {post.end_time?.slice(0, 5)}</p>
                      <p className="flex items-center gap-2"><Users className="h-4 w-4" />{post.joined_players}/{post.needed_players} joined ({seatsLeft} left)</p>
                    </div>

                    {post.skill_level && <Badge variant="outline">Skill: {post.skill_level}</Badge>}
                    {post.notes && <p className="text-xs text-muted-foreground">{post.notes}</p>}

                    {isHost ? (
                      <Button variant="outline" className="w-full" disabled>
                        You are the host
                      </Button>
                    ) : joined ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={actionLoadingId === post.id}
                        onClick={() => handleLeave(post.id)}
                      >
                        {actionLoadingId === post.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Leave Match
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        disabled={post.status !== 'open' || seatsLeft <= 0 || actionLoadingId === post.id}
                        onClick={() => handleJoin(post.id)}
                      >
                        {actionLoadingId === post.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Join Instantly
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}