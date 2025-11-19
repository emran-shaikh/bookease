import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Building2, Calendar, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function OwnerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [courts, setCourts] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState(0);

  useEffect(() => {
    if (user) {
      fetchOwnerData();
    }
  }, [user]);

  async function fetchOwnerData() {
    try {
      const [courtsData, bookingsData] = await Promise.all([
        supabase.from('courts').select('*').eq('owner_id', user?.id),
        supabase.from('bookings').select(`
          *,
          courts!inner(owner_id, name)
        `).eq('courts.owner_id', user?.id),
      ]);

      if (courtsData.error) throw courtsData.error;
      if (bookingsData.error) throw bookingsData.error;

      setCourts(courtsData.data || []);
      setBookings(bookingsData.data || []);

      const totalEarnings = bookingsData.data
        ?.filter((b: any) => b.payment_status === 'succeeded')
        .reduce((sum: number, b: any) => sum + parseFloat(b.total_price), 0) || 0;
      
      setEarnings(totalEarnings);
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

  const upcomingBookings = bookings.filter(b => 
    new Date(b.booking_date) >= new Date() && b.status !== 'cancelled'
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
          <h1 className="mb-2 text-3xl font-bold">Owner Dashboard</h1>
          <p className="text-muted-foreground">Manage your courts and bookings</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Courts</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{courts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Upcoming Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingBookings.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${earnings.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="courts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="courts">My Courts</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
          </TabsList>

          <TabsContent value="courts" className="space-y-4">
            {courts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-4 text-muted-foreground">No courts listed yet</p>
                  <Button>Add Your First Court</Button>
                </CardContent>
              </Card>
            ) : (
              courts.map((court) => (
                <Card key={court.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{court.name}</CardTitle>
                        <CardDescription>
                          {court.city}, {court.state}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={
                          court.status === 'approved'
                            ? 'default'
                            : court.status === 'pending'
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {court.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 text-sm">
                      <div>
                        <span className="font-medium">Sport:</span> {court.sport_type}
                      </div>
                      <div>
                        <span className="font-medium">Base Price:</span> ${court.base_price}/hour
                      </div>
                      <div>
                        <span className="font-medium">Active:</span>{' '}
                        {court.is_active ? 'Yes' : 'No'}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="bookings" className="space-y-4">
            {bookings.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">No bookings yet</p>
                </CardContent>
              </Card>
            ) : (
              bookings.map((booking) => (
                <Card key={booking.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{booking.courts?.name}</CardTitle>
                        <CardDescription>
                          {format(new Date(booking.booking_date), 'MMMM d, yyyy')}
                        </CardDescription>
                      </div>
                      <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'}>
                        {booking.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 text-sm">
                      <div>
                        <span className="font-medium">Time:</span>{' '}
                        {booking.start_time} - {booking.end_time}
                      </div>
                      <div>
                        <span className="font-medium">Amount:</span> ${booking.total_price}
                      </div>
                      <div>
                        <span className="font-medium">Payment:</span>{' '}
                        <Badge variant={booking.payment_status === 'succeeded' ? 'default' : 'secondary'}>
                          {booking.payment_status}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
