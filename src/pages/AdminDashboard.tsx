import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { SEO } from '@/components/SEO';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, CheckCircle, XCircle, Users, Building2, Calendar, CreditCard, ArrowUpDown, Edit, Trash2, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { formatPrice } from '@/lib/currency';
import { CourtEditForm } from '@/components/CourtEditForm';
import { formatTimeSlot12h } from '@/lib/utils';
import { DashboardFilters, FilterState } from '@/components/DashboardFilters';

type SortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'amount-desc' | 'amount-asc' | 'status';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pendingCourts, setPendingCourts] = useState<any[]>([]);
  const [allCourts, setAllCourts] = useState<any[]>([]);
  const [pendingVenues, setPendingVenues] = useState<any[]>([]);
  const [allVenues, setAllVenues] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingSort, setBookingSort] = useState<SortOption>('date-desc');
  const [courtSort, setCourtSort] = useState<SortOption>('name-asc');
  const [venueSort, setVenueSort] = useState<SortOption>('name-asc');
  const [userSort, setUserSort] = useState<SortOption>('name-asc');
  const [editingCourt, setEditingCourt] = useState<any>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  
  // Filter states
  const [bookingFilters, setBookingFilters] = useState<FilterState>({});
  const [courtFilters, setCourtFilters] = useState<FilterState>({});
  const [venueFilters, setVenueFilters] = useState<FilterState>({});
  const [userFilters, setUserFilters] = useState<FilterState>({});
  const [paymentFilters, setPaymentFilters] = useState<FilterState>({});
  const [analytics, setAnalytics] = useState({
    totalCourts: 0,
    totalVenues: 0,
    totalBookings: 0,
    totalRevenue: 0,
    activeUsers: 0,
  });

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate('/');
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to access this page',
        variant: 'destructive',
      });
    }
  }, [isAdmin, roleLoading, navigate, toast]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchAdminData();
    }
  }, [user, isAdmin]);

  async function fetchAdminData() {
    try {
      const [courtsData, allCourtsData, venuesData, allVenuesData, usersData, bookingsData] = await Promise.all([
        supabase.from('courts').select('*, profiles(full_name, email)').eq('status', 'pending'),
        supabase.from('courts').select('*, profiles(full_name, email)'),
        supabase.from('venues').select('*').eq('status', 'pending'),
        supabase.from('venues').select('*'),
        supabase.from('profiles').select('*, user_roles(role)'),
        supabase.from('bookings').select('*, courts(name), profiles(full_name, email)'),
      ]);

      if (courtsData.error) throw courtsData.error;
      if (allCourtsData.error) throw allCourtsData.error;
      if (venuesData.error) throw venuesData.error;
      if (allVenuesData.error) throw allVenuesData.error;
      if (usersData.error) throw usersData.error;
      if (bookingsData.error) throw bookingsData.error;

      setPendingCourts(courtsData.data || []);
      setAllCourts(allCourtsData.data || []);
      setPendingVenues(venuesData.data || []);
      setAllVenues(allVenuesData.data || []);
      setUsers(usersData.data || []);
      setBookings(bookingsData.data || []);

      const totalRevenue = bookingsData.data
        ?.filter((b: any) => b.payment_status === 'succeeded')
        .reduce((sum: number, b: any) => sum + parseFloat(b.total_price), 0) || 0;

      setAnalytics({
        totalCourts: allCourtsData.data?.length || 0,
        totalVenues: allVenuesData.data?.length || 0,
        totalBookings: bookingsData.data?.length || 0,
        totalRevenue,
        activeUsers: usersData.data?.length || 0,
      });
    } catch (error: any) {
      toast({
        title: 'Error loading data',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function updateCourtStatus(courtId: string, status: 'approved' | 'rejected') {
    try {
      const { error } = await supabase
        .from('courts')
        .update({ status })
        .eq('id', courtId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Court ${status} successfully`,
      });

      fetchAdminData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  async function updateUserRole(userId: string, newRole: 'admin' | 'court_owner' | 'customer') {
    try {
      const { data: existingRoles } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId);

      if (existingRoles && existingRoles.length > 0) {
        // Delete all existing roles
        await supabase.from('user_roles').delete().eq('user_id', userId);
      }

      // Insert new role
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: newRole });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'User role updated successfully',
      });

      fetchAdminData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  async function handleDeleteCourt(courtId: string) {
    if (!confirm('Are you sure you want to delete this court? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase.from('courts').delete().eq('id', courtId);
      if (error) throw error;

      toast({ title: 'Success', description: 'Court deleted successfully' });
      fetchAdminData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  async function updateVenueStatus(venueId: string, status: 'approved' | 'rejected') {
    try {
      const { error } = await supabase
        .from('venues')
        .update({ status })
        .eq('id', venueId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Venue ${status} successfully`,
      });

      fetchAdminData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  async function handleDeleteVenue(venueId: string) {
    if (!confirm('Are you sure you want to delete this venue? This will also affect courts linked to it.')) {
      return;
    }

    try {
      const { error } = await supabase.from('venues').delete().eq('id', venueId);
      if (error) throw error;

      toast({ title: 'Success', description: 'Venue deleted successfully' });
      fetchAdminData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  // Filtered and sorted data using useMemo
  const filteredBookings = useMemo(() => {
    return bookings.filter(booking => {
      if (bookingFilters.status && bookingFilters.status !== 'all') {
        if (booking.status !== bookingFilters.status) return false;
      }
      if (bookingFilters.paymentStatus && bookingFilters.paymentStatus !== 'all') {
        if (booking.payment_status !== bookingFilters.paymentStatus) return false;
      }
      if (bookingFilters.dateFrom) {
        if (new Date(booking.booking_date) < bookingFilters.dateFrom) return false;
      }
      if (bookingFilters.dateTo) {
        if (new Date(booking.booking_date) > bookingFilters.dateTo) return false;
      }
      if (bookingFilters.search) {
        const searchLower = bookingFilters.search.toLowerCase();
        const customerName = booking.profiles?.full_name?.toLowerCase() || '';
        const customerEmail = booking.profiles?.email?.toLowerCase() || '';
        const courtName = booking.courts?.name?.toLowerCase() || '';
        if (!customerName.includes(searchLower) && !customerEmail.includes(searchLower) && !courtName.includes(searchLower)) {
          return false;
        }
      }
      return true;
    });
  }, [bookings, bookingFilters]);

  const sortedBookings = useMemo(() => {
    const sorted = [...filteredBookings];
    switch (bookingSort) {
      case 'date-desc':
        return sorted.sort((a, b) => new Date(b.booking_date).getTime() - new Date(a.booking_date).getTime());
      case 'date-asc':
        return sorted.sort((a, b) => new Date(a.booking_date).getTime() - new Date(b.booking_date).getTime());
      case 'name-asc':
        return sorted.sort((a, b) => (a.courts?.name || '').localeCompare(b.courts?.name || ''));
      case 'name-desc':
        return sorted.sort((a, b) => (b.courts?.name || '').localeCompare(a.courts?.name || ''));
      case 'amount-desc':
        return sorted.sort((a, b) => parseFloat(b.total_price) - parseFloat(a.total_price));
      case 'amount-asc':
        return sorted.sort((a, b) => parseFloat(a.total_price) - parseFloat(b.total_price));
      case 'status':
        return sorted.sort((a, b) => a.status.localeCompare(b.status));
      default:
        return sorted;
    }
  }, [filteredBookings, bookingSort]);

  const filteredCourts = useMemo(() => {
    return allCourts.filter(court => {
      if (courtFilters.status && courtFilters.status !== 'all') {
        if (court.status !== courtFilters.status) return false;
      }
      if (courtFilters.search) {
        const searchLower = courtFilters.search.toLowerCase();
        const courtName = court.name?.toLowerCase() || '';
        const ownerName = court.profiles?.full_name?.toLowerCase() || '';
        const ownerEmail = court.profiles?.email?.toLowerCase() || '';
        const city = court.city?.toLowerCase() || '';
        if (!courtName.includes(searchLower) && !ownerName.includes(searchLower) && !ownerEmail.includes(searchLower) && !city.includes(searchLower)) {
          return false;
        }
      }
      return true;
    });
  }, [allCourts, courtFilters]);

  const sortedCourts = useMemo(() => {
    const sorted = [...filteredCourts];
    switch (courtSort) {
      case 'name-asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'amount-desc':
        return sorted.sort((a, b) => parseFloat(b.base_price) - parseFloat(a.base_price));
      case 'amount-asc':
        return sorted.sort((a, b) => parseFloat(a.base_price) - parseFloat(b.base_price));
      case 'status':
        return sorted.sort((a, b) => a.status.localeCompare(b.status));
      default:
        return sorted;
    }
  }, [filteredCourts, courtSort]);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      if (userFilters.role && userFilters.role !== 'all') {
        const userRole = user.user_roles?.[0]?.role || 'customer';
        if (userRole !== userFilters.role) return false;
      }
      if (userFilters.search) {
        const searchLower = userFilters.search.toLowerCase();
        const userName = user.full_name?.toLowerCase() || '';
        const userEmail = user.email?.toLowerCase() || '';
        const userPhone = user.phone?.toLowerCase() || '';
        if (!userName.includes(searchLower) && !userEmail.includes(searchLower) && !userPhone.includes(searchLower)) {
          return false;
        }
      }
      return true;
    });
  }, [users, userFilters]);

  const sortedUsers = useMemo(() => {
    const sorted = [...filteredUsers];
    switch (userSort) {
      case 'name-asc':
        return sorted.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
      case 'name-desc':
        return sorted.sort((a, b) => (b.full_name || '').localeCompare(a.full_name || ''));
      default:
        return sorted;
    }
  }, [filteredUsers, userSort]);

  const filteredPayments = useMemo(() => {
    return bookings.filter(booking => {
      // Only show non-pending payments by default, unless specifically filtered
      if (!paymentFilters.paymentStatus || paymentFilters.paymentStatus === 'all') {
        if (booking.payment_status === 'pending') return false;
      } else {
        if (booking.payment_status !== paymentFilters.paymentStatus) return false;
      }
      if (paymentFilters.dateFrom) {
        if (new Date(booking.booking_date) < paymentFilters.dateFrom) return false;
      }
      if (paymentFilters.dateTo) {
        if (new Date(booking.booking_date) > paymentFilters.dateTo) return false;
      }
      if (paymentFilters.search) {
        const searchLower = paymentFilters.search.toLowerCase();
        const customerName = booking.profiles?.full_name?.toLowerCase() || '';
        const customerEmail = booking.profiles?.email?.toLowerCase() || '';
        const courtName = booking.courts?.name?.toLowerCase() || '';
        if (!customerName.includes(searchLower) && !customerEmail.includes(searchLower) && !courtName.includes(searchLower)) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [bookings, paymentFilters]);

  const filteredVenues = useMemo(() => {
    return allVenues.filter(venue => {
      if (venueFilters.status && venueFilters.status !== 'all') {
        if (venue.status !== venueFilters.status) return false;
      }
      if (venueFilters.search) {
        const searchLower = venueFilters.search.toLowerCase();
        const venueName = venue.name?.toLowerCase() || '';
        const city = venue.city?.toLowerCase() || '';
        const address = venue.address?.toLowerCase() || '';
        if (!venueName.includes(searchLower) && !city.includes(searchLower) && !address.includes(searchLower)) {
          return false;
        }
      }
      return true;
    });
  }, [allVenues, venueFilters]);

  const sortedVenues = useMemo(() => {
    const sorted = [...filteredVenues];
    switch (venueSort) {
      case 'name-asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'date-desc':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'date-asc':
        return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'status':
        return sorted.sort((a, b) => a.status.localeCompare(b.status));
      default:
        return sorted;
    }
  }, [filteredVenues, venueSort]);

  if (loading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title="Admin Dashboard"
        description="BookedHours admin panel. Manage courts, users, bookings, and monitor platform activity."
        keywords="admin dashboard, platform management, court approval, user management"
      />
      <Header />
      
      <main className="container py-8">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage courts, users, and monitor platform activity</p>
        </div>

        <div className="grid gap-6 md:grid-cols-5 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Venues</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalVenues}</div>
              <p className="text-xs text-muted-foreground">{pendingVenues.length} pending approval</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Courts</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalCourts}</div>
              <p className="text-xs text-muted-foreground">{pendingCourts.length} pending approval</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.totalBookings}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(analytics.totalRevenue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.activeUsers}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="venues" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="venues">Pending Venues</TabsTrigger>
            <TabsTrigger value="courts">Pending Courts</TabsTrigger>
            <TabsTrigger value="all-venues">All Venues</TabsTrigger>
            <TabsTrigger value="all-courts">All Courts</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="venues">
            <Card>
              <CardHeader>
                <CardTitle>Pending Venue Approvals</CardTitle>
                <CardDescription>Review and approve new venue listings</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingVenues.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No pending venues</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Venue Name</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingVenues.map((venue) => (
                        <TableRow key={venue.id}>
                          <TableCell className="font-medium">{venue.name}</TableCell>
                          <TableCell>{venue.address}</TableCell>
                          <TableCell>{venue.city}, {venue.state}</TableCell>
                          <TableCell>{venue.contact_email || venue.contact_phone || '-'}</TableCell>
                          <TableCell>{format(new Date(venue.created_at), 'MMM d, yyyy')}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => updateVenueStatus(venue.id, 'approved')}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => updateVenueStatus(venue.id, 'rejected')}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="courts">
            <Card>
              <CardHeader>
                <CardTitle>Pending Court Approvals</CardTitle>
                <CardDescription>Review and approve new court listings</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingCourts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No pending courts</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Court Name</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Sport</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingCourts.map((court) => (
                        <TableRow key={court.id}>
                          <TableCell className="font-medium">{court.name}</TableCell>
                          <TableCell>{court.profiles?.full_name || court.profiles?.email}</TableCell>
                          <TableCell>{court.city}, {court.state}</TableCell>
                          <TableCell>{court.sport_type}</TableCell>
                          <TableCell>{formatPrice(court.base_price)}/hr</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => updateCourtStatus(court.id, 'approved')}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => updateCourtStatus(court.id, 'rejected')}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all-venues">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>All Venues</CardTitle>
                  <CardDescription>View and manage all venue listings</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <DashboardFilters
                  filters={venueFilters}
                  onFilterChange={setVenueFilters}
                  showStatusFilter
                  showSearchFilter
                  placeholder="Search by venue name, city..."
                />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Showing {sortedVenues.length} of {allVenues.length} venues
                  </span>
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    <Select value={venueSort} onValueChange={(v) => setVenueSort(v as SortOption)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                        <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                        <SelectItem value="date-desc">Date (Newest)</SelectItem>
                        <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Venue Name</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedVenues.map((venue) => (
                      <TableRow key={venue.id}>
                        <TableCell className="font-medium">{venue.name}</TableCell>
                        <TableCell>{venue.address}</TableCell>
                        <TableCell>{venue.city}, {venue.state}</TableCell>
                        <TableCell>
                          <Badge variant={
                            venue.status === 'approved' ? 'default' :
                            venue.status === 'rejected' ? 'destructive' : 'secondary'
                          }>
                            {venue.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(venue.created_at), 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {venue.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateVenueStatus(venue.id, 'approved')}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateVenueStatus(venue.id, 'rejected')}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteVenue(venue.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bookings">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>All Bookings</CardTitle>
                  <CardDescription>View and manage all court bookings</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <DashboardFilters
                  filters={bookingFilters}
                  onFilterChange={setBookingFilters}
                  showStatusFilter
                  showPaymentFilter
                  showDateFilter
                  showSearchFilter
                  placeholder="Search by customer, court..."
                />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Showing {sortedBookings.length} of {bookings.length} bookings
                  </span>
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    <Select value={bookingSort} onValueChange={(v) => setBookingSort(v as SortOption)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date-desc">Date (Newest)</SelectItem>
                        <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                        <SelectItem value="name-asc">Court (A-Z)</SelectItem>
                        <SelectItem value="name-desc">Court (Z-A)</SelectItem>
                        <SelectItem value="amount-desc">Amount (High-Low)</SelectItem>
                        <SelectItem value="amount-asc">Amount (Low-High)</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Court</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedBookings.map((booking) => (
                        <TableRow key={booking.id}>
                          <TableCell>{format(new Date(booking.booking_date), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="font-medium">{booking.courts?.name || 'N/A'}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{booking.profiles?.full_name || 'N/A'}</div>
                              <div className="text-xs text-muted-foreground">{booking.profiles?.email}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{formatTimeSlot12h(booking.start_time, booking.end_time)}</TableCell>
                          <TableCell>{formatPrice(booking.total_price)}</TableCell>
                          <TableCell>
                            <Badge variant={booking.status === 'confirmed' ? 'default' : booking.status === 'cancelled' ? 'destructive' : 'secondary'}>
                              {booking.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={booking.payment_status === 'succeeded' ? 'default' : booking.payment_status === 'failed' ? 'destructive' : 'secondary'}>
                              {booking.payment_status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {booking.status === 'pending' && booking.payment_status === 'pending' && (
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const { error: updateError } = await supabase
                                        .from('bookings')
                                        .update({ 
                                          status: 'confirmed',
                                          payment_status: 'succeeded'
                                        })
                                        .eq('id', booking.id);

                                      if (updateError) throw updateError;

                                      await supabase.from('notifications').insert([
                                        {
                                          user_id: booking.user_id,
                                          title: '✅ Booking Confirmed',
                                          message: `Your booking for ${booking.courts?.name} on ${format(new Date(booking.booking_date), 'MMM d, yyyy')} has been confirmed!`,
                                          type: 'success',
                                          related_court_id: booking.court_id,
                                        }
                                      ]);

                                      // Send email notification
                                      await supabase.functions.invoke('send-booking-confirmation', {
                                        body: {
                                          bookingId: booking.id,
                                          userEmail: booking.profiles?.email,
                                          userName: booking.profiles?.full_name || 'Customer',
                                          courtName: booking.courts?.name,
                                          bookingDate: format(new Date(booking.booking_date), 'MMMM d, yyyy'),
                                          startTime: booking.start_time,
                                          endTime: booking.end_time,
                                          totalPrice: booking.total_price,
                                        }
                                      });

                                      toast({ 
                                        title: 'Success', 
                                        description: 'Booking confirmed and customer notified' 
                                      });
                                      fetchAdminData();
                                    } catch (error: any) {
                                      toast({ 
                                        title: 'Error', 
                                        description: error.message, 
                                        variant: 'destructive' 
                                      });
                                    }
                                  }}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Confirm
                                </Button>
                              )}
                              {(booking.status === 'confirmed' || booking.status === 'pending') && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={async () => {
                                    if (!confirm('Are you sure you want to cancel this booking?')) return;
                                    try {
                                      const { error } = await supabase
                                        .from('bookings')
                                        .update({ status: 'cancelled' })
                                        .eq('id', booking.id);

                                      if (error) throw error;

                                      await supabase.from('notifications').insert([
                                        {
                                          user_id: booking.user_id,
                                          title: '❌ Booking Cancelled',
                                          message: `Your booking for ${booking.courts?.name} on ${format(new Date(booking.booking_date), 'MMM d, yyyy')} has been cancelled.`,
                                          type: 'error',
                                          related_court_id: booking.court_id,
                                        }
                                      ]);

                                      toast({ title: 'Success', description: 'Booking cancelled' });
                                      fetchAdminData();
                                    } catch (error: any) {
                                      toast({ title: 'Error', description: error.message, variant: 'destructive' });
                                    }
                                  }}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all-courts">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>All Courts</CardTitle>
                  <CardDescription>View and manage all court listings</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <DashboardFilters
                  filters={courtFilters}
                  onFilterChange={setCourtFilters}
                  showStatusFilter
                  showSearchFilter
                  statusOptions={[
                    { value: 'all', label: 'All Status' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'approved', label: 'Approved' },
                    { value: 'rejected', label: 'Rejected' },
                  ]}
                  placeholder="Search by court, owner, city..."
                />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Showing {sortedCourts.length} of {allCourts.length} courts
                  </span>
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    <Select value={courtSort} onValueChange={(v) => setCourtSort(v as SortOption)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                        <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                        <SelectItem value="amount-desc">Price (High-Low)</SelectItem>
                        <SelectItem value="amount-asc">Price (Low-High)</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Court Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Sport</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCourts.map((court) => (
                      <TableRow key={court.id}>
                        <TableCell className="font-medium">{court.name}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{court.profiles?.full_name || 'N/A'}</div>
                            <div className="text-xs text-muted-foreground">{court.profiles?.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>{court.city}, {court.state}</TableCell>
                        <TableCell>{court.sport_type}</TableCell>
                        <TableCell>{formatPrice(court.base_price)}/hr</TableCell>
                        <TableCell>
                          <Badge variant={court.status === 'approved' ? 'default' : court.status === 'pending' ? 'secondary' : 'destructive'}>
                            {court.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingCourt(court);
                                setShowEditDialog(true);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteCourt(court.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Edit Court Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Court</DialogTitle>
                </DialogHeader>
                {editingCourt && (
                  <CourtEditForm
                    court={editingCourt}
                    onSuccess={() => {
                      setShowEditDialog(false);
                      setEditingCourt(null);
                      fetchAdminData();
                    }}
                    onCancel={() => {
                      setShowEditDialog(false);
                      setEditingCourt(null);
                    }}
                  />
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>Manage user roles and permissions</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <DashboardFilters
                  filters={userFilters}
                  onFilterChange={setUserFilters}
                  showRoleFilter
                  showSearchFilter
                  placeholder="Search by name, email, phone..."
                />
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Showing {sortedUsers.length} of {users.length} users
                  </span>
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    <Select value={userSort} onValueChange={(v) => setUserSort(v as SortOption)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                        <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Current Role</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name || 'N/A'}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.phone || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {user.user_roles?.[0]?.role || 'customer'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUserRole(user.id, 'customer')}
                            >
                              Customer
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUserRole(user.id, 'court_owner')}
                            >
                              Owner
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUserRole(user.id, 'admin')}
                            >
                              Admin
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>Payment History</CardTitle>
                <CardDescription>Monitor all platform transactions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <DashboardFilters
                  filters={paymentFilters}
                  onFilterChange={setPaymentFilters}
                  showPaymentFilter
                  showDateFilter
                  showSearchFilter
                  placeholder="Search by customer, court..."
                />
                
                <div className="text-sm text-muted-foreground">
                  Showing {filteredPayments.length} payments
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Court</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.slice(0, 100).map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell>{format(new Date(booking.booking_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>{booking.profiles?.full_name || booking.profiles?.email}</TableCell>
                        <TableCell>{booking.courts?.name}</TableCell>
                        <TableCell>{formatPrice(booking.total_price)}</TableCell>
                        <TableCell>
                          <Badge variant={booking.payment_status === 'succeeded' ? 'default' : booking.payment_status === 'failed' ? 'destructive' : 'secondary'}>
                            {booking.payment_status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}