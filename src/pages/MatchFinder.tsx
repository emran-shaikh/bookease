import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { SEO } from '@/components/SEO';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Loader2, Users, MapPin, Calendar, Clock, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function MatchFinder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [joinedPostIds, setJoinedPostIds] = useState<Set<string>>(new Set());
  const [participantsByPost, setParticipantsByPost] = useState<Record<string, any[]>>({});
  const [guestRequestsByPost, setGuestRequestsByPost] = useState<Record<string, any[]>>({});
  const [requestActionLoadingId, setRequestActionLoadingId] = useState<string | null>(null);
  const [expandedHostCardId, setExpandedHostCardId] = useState<string | null>(null);
  const [currentUserPhone, setCurrentUserPhone] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [sportFilter, setSportFilter] = useState('all');
  const [skillFilter, setSkillFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    fetchMatchData();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`match-finder-host:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_guest_contacts',
          filter: `host_user_id=eq.${user.id}`,
        },
        () => {
          fetchMatchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_posts',
          filter: `host_user_id=eq.${user.id}`,
        },
        () => {
          fetchMatchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  async function fetchMatchData() {
    try {
      setLoading(true);

      const postsQuery = supabase
        .from('match_posts')
        .select(`
          *,
          courts (name, location, city),
          venues (name, location, city)
        `)
        .in('status', ['open', 'full'])
        .order('match_date', { ascending: true })
        .order('start_time', { ascending: true });

      const [postsResponse, participantsResponse, profileResponse] = await Promise.all([
        postsQuery,
        user?.id
          ? supabase
              .from('match_participants')
              .select('post_id')
              .eq('user_id', user.id)
              .eq('status', 'joined')
          : Promise.resolve({ data: [], error: null } as any),
        user?.id
          ? supabase
              .from('profiles')
              .select('phone')
              .eq('id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      if (postsResponse.error) throw postsResponse.error;
      if (participantsResponse?.error) throw participantsResponse.error;
      if (profileResponse?.error) throw profileResponse.error;

      const now = new Date();
      const nextPosts = (postsResponse.data || []).filter((post: any) => {
        const start = new Date(`${post.match_date}T${post.start_time}`);
        return !Number.isNaN(start.getTime()) && start > now;
      });
      setPosts(nextPosts);
      setJoinedPostIds(new Set((participantsResponse?.data || []).map((row: any) => row.post_id)));
      setCurrentUserPhone(profileResponse?.data?.phone?.trim() ? profileResponse.data.phone.trim() : null);

      if (user?.id) {
        const hostedPostIds = nextPosts
          .filter((post: any) => post.host_user_id === user.id)
          .map((post: any) => post.id);

        if (hostedPostIds.length > 0) {
          const [{ data: participants, error: participantsError }, { data: guestRequests, error: guestRequestsError }] = await Promise.all([
            supabase
              .from('match_participants')
              .select('id, post_id, status, joined_at, participant_profile:owner_customer_contacts!match_participants_user_id_fkey(full_name, email)')
              .in('post_id', hostedPostIds)
              .order('joined_at', { ascending: true }),
            supabase
              .from('match_guest_contacts')
              .select(`
                id,
                post_id,
                guest_name,
                guest_phone,
                guest_note,
                created_at,
                status,
                decided_at,
                contact_profile:owner_customer_contacts!match_guest_contacts_contact_user_id_fkey(full_name, email)
              `)
              .in('post_id', hostedPostIds)
              .order('created_at', { ascending: false }),
          ]);

          if (participantsError) throw participantsError;
          if (guestRequestsError) throw guestRequestsError;

          setParticipantsByPost(
            (participants || []).reduce((acc: Record<string, any[]>, participant: any) => {
              acc[participant.post_id] = [...(acc[participant.post_id] || []), participant];
              return acc;
            }, {})
          );

          setGuestRequestsByPost(
            (guestRequests || []).reduce((acc: Record<string, any[]>, request: any) => {
              acc[request.post_id] = [...(acc[request.post_id] || []), request];
              return acc;
            }, {})
          );
        } else {
          setParticipantsByPost({});
          setGuestRequestsByPost({});
        }
      } else {
        setParticipantsByPost({});
        setGuestRequestsByPost({});
        setCurrentUserPhone(null);
      }
    } catch (error: any) {
      toast.error('Unable to load match finder', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(postId: string) {
    if (!user?.id) {
      toast.error('Sign in required', {
        description: 'Please sign in to join matches.',
      });
      return;
    }

    if (!currentUserPhone) {
      toast.error('Phone number required', {
        description: 'Please update your phone number in your account before joining a match.',
      });
      navigate('/complete-profile?return=/matches');
      return;
    }

    let joiningToastId: string | number | undefined;

    try {
      setActionLoadingId(postId);
      joiningToastId = toast.loading('Joining match...');
      const { error } = await supabase.rpc('join_match_post', {
        _post_id: postId,
        _user_id: user.id,
      });
      if (error) throw error;

      toast.success('Joined match', {
        description: 'Your slot is confirmed instantly.',
        id: joiningToastId,
      });
      fetchMatchData();
    } catch (error: any) {
      toast.error('Could not join', {
        description: error.message,
        id: joiningToastId,
      });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleGuestRequestDecision(contactId: string, nextStatus: 'accepted' | 'rejected') {
    if (!user?.id) return;

    let requestToastId: string | number | undefined;

    try {
      setRequestActionLoadingId(contactId);
      requestToastId = toast.loading(nextStatus === 'accepted' ? 'Accepting request...' : 'Rejecting request...');
      const { error } = await supabase.rpc('update_guest_match_contact_status', {
        _contact_id: contactId,
        _status: nextStatus,
        _actor_user_id: user.id,
      });

      if (error) throw error;

      toast.success(nextStatus === 'accepted' ? 'Request accepted' : 'Request rejected', {
        description: 'Join request status updated successfully.',
        id: requestToastId,
      });

      fetchMatchData();
    } catch (error: any) {
      toast.error('Could not update request', {
        description: error.message,
        id: requestToastId,
      });
    } finally {
      setRequestActionLoadingId(null);
    }
  }

  async function handleLeave(postId: string) {
    if (!user?.id) return;

    let leaveToastId: string | number | undefined;

    try {
      setActionLoadingId(postId);
      leaveToastId = toast.loading('Leaving match...');
      const { error } = await supabase.rpc('leave_match_post', {
        _post_id: postId,
        _user_id: user.id,
      });
      if (error) throw error;

      toast.success('Left match', {
        description: 'You have left this match request.',
        id: leaveToastId,
      });
      fetchMatchData();
    } catch (error: any) {
      toast.error('Could not leave', {
        description: error.message,
        id: leaveToastId,
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
      const matchStart = new Date(`${post.match_date}T${post.start_time}`);
      const isUpcoming = !Number.isNaN(matchStart.getTime()) && matchStart > now;

      if (!isUpcoming) {
        return false;
      }

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
              const resolvedCity = post.city || post.courts?.city || post.venues?.city || '';
              const resolvedLocation = post.courts?.location || post.venues?.location || '';
              const locationLabel = [resolvedCity, resolvedLocation].filter(Boolean).join(', ') || 'Location not set';
              const joinedParticipants = (participantsByPost[post.id] || []).filter((participant) => participant.status === 'joined');
              const hostRequests = guestRequestsByPost[post.id] || [];
              const pendingRequests = hostRequests.filter((request) => request.status === 'pending');
              const hasReviewedRequests = hostRequests.some((request) => request.status !== 'pending');
              const isExpanded = expandedHostCardId === post.id;
              const visibleRequests = isExpanded ? hostRequests : pendingRequests.slice(0, 2);

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
                      <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{locationLabel}</p>
                      <p className="flex items-center gap-2"><Calendar className="h-4 w-4" />{format(new Date(post.match_date), 'MMM d, yyyy')}</p>
                      <p className="flex items-center gap-2"><Clock className="h-4 w-4" />{post.start_time?.slice(0, 5)} - {post.end_time?.slice(0, 5)}</p>
                      <p className="flex items-center gap-2"><Users className="h-4 w-4" />{post.joined_players}/{post.needed_players} joined ({seatsLeft} left)</p>
                    </div>

                    {post.skill_level && <Badge variant="outline">Skill: {post.skill_level}</Badge>}
                    {post.notes && <p className="text-xs text-muted-foreground">{post.notes}</p>}

                    {isHost ? (
                      <div className="space-y-2 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium">Joined Players</p>
                          <Badge variant="outline" className="text-[10px]">{joinedParticipants.length} active</Badge>
                        </div>

                        {joinedParticipants.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No joined players yet.</p>
                        ) : (
                          <div className="space-y-1">
                            {joinedParticipants.map((participant) => (
                              <div key={participant.id} className="rounded-md border px-2 py-1.5">
                                <p className="text-xs font-medium truncate">{participant.participant_profile?.full_name || 'Player'}</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {participant.participant_profile?.phone || participant.participant_profile?.email || 'No contact'}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="h-px bg-border" />

                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium">Guest Join Requests</p>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px]">{pendingRequests.length} pending</Badge>
                            <Badge variant="secondary" className="text-[10px]">{hostRequests.length} total</Badge>
                          </div>
                        </div>

                        {visibleRequests.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No guest requests yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {visibleRequests.map((request) => {
                              const canReview = request.status === 'pending';

                              return (
                                <div key={request.id} className="rounded-md border p-2 space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="text-xs min-w-0">
                                      <p className="font-medium truncate">{request.guest_name || request.contact_profile?.full_name || 'Guest Player'}</p>
                                      <p className="text-muted-foreground truncate">{request.guest_phone}</p>
                                      {request.guest_note ? <p className="text-muted-foreground break-words">{request.guest_note}</p> : null}
                                    </div>
                                    <Badge
                                      variant={
                                        request.status === 'accepted'
                                          ? 'default'
                                          : request.status === 'rejected'
                                            ? 'secondary'
                                            : 'outline'
                                      }
                                      className="text-[10px]"
                                    >
                                      {request.status}
                                    </Badge>
                                  </div>

                                  {canReview ? (
                                    <div className="grid grid-cols-2 gap-2">
                                      <Button
                                        size="sm"
                                        className="h-7 text-[11px]"
                                        onClick={() => handleGuestRequestDecision(request.id, 'accepted')}
                                        disabled={requestActionLoadingId === request.id}
                                      >
                                        {requestActionLoadingId === request.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                        Accept
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[11px]"
                                        onClick={() => handleGuestRequestDecision(request.id, 'rejected')}
                                        disabled={requestActionLoadingId === request.id}
                                      >
                                        Reject
                                      </Button>
                                    </div>
                                  ) : (
                                    <p className="text-[10px] text-muted-foreground">
                                      Reviewed {request.decided_at ? format(new Date(request.decided_at), 'MMM d, p') : ''}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {(pendingRequests.length > 2 || hasReviewedRequests) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-7 text-[11px]"
                            onClick={() => setExpandedHostCardId(isExpanded ? null : post.id)}
                          >
                            {isExpanded
                              ? 'Show pending only'
                              : `Show all requests (${hostRequests.length})`}
                          </Button>
                        )}
                      </div>
                    ) : joined ? (
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled
                      >
                        Already Joined
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        {user?.id && (
                          <p className="text-[11px] text-muted-foreground">
                            Contact: {currentUserPhone || 'Add phone number in account to join'}
                          </p>
                        )}
                        <Button
                          className="w-full"
                          disabled={post.status !== 'open' || seatsLeft <= 0 || actionLoadingId === post.id}
                          onClick={() => handleJoin(post.id)}
                        >
                          {actionLoadingId === post.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          {user?.id && !currentUserPhone ? 'Add Phone to Join' : 'Join Instantly'}
                        </Button>
                      </div>
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