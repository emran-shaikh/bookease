import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, CheckCircle, XCircle, Users, Building2, DollarSign, Calendar, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

export default function AdminDashboard() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pendingCourts, setPendingCourts] = useState<any[]>([]);
  const [allCourts, setAllCourts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState({
    totalCourts: 0,
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
      const [courtsData, allCourtsData, usersData, bookingsData] = await Promise.all([
        supabase.from('courts').select('*, profiles(full_name, email)').eq('status', 'pending'),
        supabase.from('courts').select('*, profiles(full_name, email)'),
        supabase.from('profiles').select('*, user_roles(role)'),
        supabase.from('bookings').select('*, courts(name), profiles(full_name, email)'),
      ]);

      if (courtsData.error) throw courtsData.error;
      if (allCourtsData.error) throw allCourtsData.error;
      if (usersData.error) throw usersData.error;
      if (bookingsData.error) throw bookingsData.error;

      setPendingCourts(courtsData.data || []);
      setAllCourts(allCourtsData.data || []);
      setUsers(usersData.data || []);
      setBookings(bookingsData.data || []);

      const totalRevenue = bookingsData.data
        ?.filter((b: any) => b.payment_status === 'succeeded')
        .reduce((sum: number, b: any) => sum + parseFloat(b.total_price), 0) || 0;

      setAnalytics({
        totalCourts: allCourtsData.data?.length || 0,
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

  if (loading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage courts, users, and monitor platform activity</p>
        </div>

        <div className="grid gap-6 md:grid-cols-4 mb-8">
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
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${analytics.totalRevenue.toFixed(2)}</div>
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

        <Tabs defaultValue="courts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="courts">Pending Courts</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="all-courts">All Courts</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

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
                          <TableCell>${court.base_price}/hr</TableCell>
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

          <TabsContent value="bookings">
            <Card>
              <CardHeader>
                <CardTitle>All Bookings</CardTitle>
                <CardDescription>View and manage all court bookings</CardDescription>
              </CardHeader>
              <CardContent>
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
                    {bookings
                      .sort((a, b) => new Date(b.booking_date).getTime() - new Date(a.booking_date).getTime())
                      .map((booking) => (
                        <TableRow key={booking.id}>
                          <TableCell>{format(new Date(booking.booking_date), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="font-medium">{booking.courts?.name}</TableCell>
                          <TableCell>{booking.profiles?.full_name || booking.profiles?.email}</TableCell>
                          <TableCell className="text-sm">{booking.start_time} - {booking.end_time}</TableCell>
                          <TableCell>${booking.total_price}</TableCell>
                          <TableCell>
                            <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'}>
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
                <CardTitle>All Courts</CardTitle>
                <CardDescription>View and manage all court listings</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Court Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Sport</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allCourts.map((court) => (
                      <TableRow key={court.id}>
                        <TableCell className="font-medium">{court.name}</TableCell>
                        <TableCell>{court.profiles?.full_name || court.profiles?.email}</TableCell>
                        <TableCell>{court.city}, {court.state}</TableCell>
                        <TableCell>{court.sport_type}</TableCell>
                        <TableCell>${court.base_price}/hr</TableCell>
                        <TableCell>
                          <Badge variant={court.status === 'approved' ? 'default' : court.status === 'pending' ? 'secondary' : 'destructive'}>
                            {court.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage user roles and permissions</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Current Role</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name || 'N/A'}</TableCell>
                        <TableCell>{user.email}</TableCell>
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
              <CardContent>
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
                    {bookings
                      .filter(b => b.payment_status !== 'pending')
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .slice(0, 50)
                      .map((booking) => (
                        <TableRow key={booking.id}>
                          <TableCell>{format(new Date(booking.booking_date), 'MMM d, yyyy')}</TableCell>
                          <TableCell>{booking.profiles?.full_name || booking.profiles?.email}</TableCell>
                          <TableCell>{booking.courts?.name}</TableCell>
                          <TableCell>${booking.total_price}</TableCell>
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