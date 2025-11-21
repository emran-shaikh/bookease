import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Building2, Calendar, DollarSign, Plus, Clock, Ban, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { CourtForm } from '@/components/CourtForm';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function OwnerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [courts, setCourts] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
  const [pricingRules, setPricingRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState(0);
  const [showCourtForm, setShowCourtForm] = useState(false);
  const [showBlockSlotForm, setShowBlockSlotForm] = useState(false);
  const [showPricingForm, setShowPricingForm] = useState(false);

  // Block slot form state
  const [blockSlotData, setBlockSlotData] = useState({
    court_id: '',
    date: '',
    start_time: '',
    end_time: '',
    reason: '',
  });

  // Pricing rule form state
  const [pricingData, setPricingData] = useState({
    court_id: '',
    rule_type: 'peak_hours',
    price_multiplier: '1.5',
    start_time: '',
    end_time: '',
    days_of_week: [] as number[],
  });

  useEffect(() => {
    if (user) {
      fetchOwnerData();
    }
  }, [user]);

  async function fetchOwnerData() {
    try {
      const [courtsData, bookingsData, blockedData, pricingData] = await Promise.all([
        supabase.from('courts').select('*').eq('owner_id', user?.id),
        supabase.from('bookings').select(`
          *,
          courts!inner(owner_id, name),
          profiles(full_name, email)
        `).eq('courts.owner_id', user?.id),
        supabase.from('blocked_slots').select(`
          *,
          courts!inner(name)
        `).eq('courts.owner_id', user?.id),
        supabase.from('pricing_rules').select(`
          *,
          courts!inner(name)
        `).eq('courts.owner_id', user?.id),
      ]);

      if (courtsData.error) throw courtsData.error;
      if (bookingsData.error) throw bookingsData.error;
      if (blockedData.error) throw blockedData.error;
      if (pricingData.error) throw pricingData.error;

      setCourts(courtsData.data || []);
      setBookings(bookingsData.data || []);
      setBlockedSlots(blockedData.data || []);
      setPricingRules(pricingData.data || []);

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

  async function handleBlockSlot(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { error } = await supabase.from('blocked_slots').insert([blockSlotData]);
      if (error) throw error;

      toast({ title: 'Success', description: 'Slot blocked successfully' });
      setShowBlockSlotForm(false);
      setBlockSlotData({ court_id: '', date: '', start_time: '', end_time: '', reason: '' });
      fetchOwnerData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  async function handleCreatePricing(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { error } = await supabase.from('pricing_rules').insert([{
        ...pricingData,
        price_multiplier: parseFloat(pricingData.price_multiplier),
      }]);
      if (error) throw error;

      toast({ title: 'Success', description: 'Pricing rule created successfully' });
      setShowPricingForm(false);
      setPricingData({ court_id: '', rule_type: 'peak_hours', price_multiplier: '1.5', start_time: '', end_time: '', days_of_week: [] });
      fetchOwnerData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  async function deleteBlockedSlot(id: string) {
    try {
      const { error } = await supabase.from('blocked_slots').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Blocked slot removed' });
      fetchOwnerData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  async function deletePricingRule(id: string) {
    try {
      const { error } = await supabase.from('pricing_rules').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Pricing rule deleted' });
      fetchOwnerData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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
          <p className="text-muted-foreground">Manage your courts, bookings, and pricing</p>
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
            <TabsTrigger value="blocked">Blocked Slots</TabsTrigger>
            <TabsTrigger value="pricing">Pricing Rules</TabsTrigger>
          </TabsList>

          <TabsContent value="courts" className="space-y-4">
            <div className="flex justify-end mb-4">
              <Dialog open={showCourtForm} onOpenChange={setShowCourtForm}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Court
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <CourtForm />
                </DialogContent>
              </Dialog>
            </div>

            {courts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">No courts listed yet</p>
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
                        <span className="font-medium">Customer:</span>{' '}
                        {booking.profiles?.full_name || booking.profiles?.email}
                      </div>
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

          <TabsContent value="blocked" className="space-y-4">
            <div className="flex justify-end mb-4">
              <Dialog open={showBlockSlotForm} onOpenChange={setShowBlockSlotForm}>
                <DialogTrigger asChild>
                  <Button>
                    <Ban className="mr-2 h-4 w-4" />
                    Block Slot
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Block Time Slot</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleBlockSlot} className="space-y-4">
                    <div>
                      <Label>Court</Label>
                      <Select value={blockSlotData.court_id} onValueChange={(value) => setBlockSlotData({...blockSlotData, court_id: value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select court" />
                        </SelectTrigger>
                        <SelectContent>
                          {courts.map(court => (
                            <SelectItem key={court.id} value={court.id}>{court.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Date</Label>
                      <Input type="date" value={blockSlotData.date} onChange={(e) => setBlockSlotData({...blockSlotData, date: e.target.value})} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Start Time</Label>
                        <Input type="time" value={blockSlotData.start_time} onChange={(e) => setBlockSlotData({...blockSlotData, start_time: e.target.value})} required />
                      </div>
                      <div>
                        <Label>End Time</Label>
                        <Input type="time" value={blockSlotData.end_time} onChange={(e) => setBlockSlotData({...blockSlotData, end_time: e.target.value})} required />
                      </div>
                    </div>
                    <div>
                      <Label>Reason (optional)</Label>
                      <Input value={blockSlotData.reason} onChange={(e) => setBlockSlotData({...blockSlotData, reason: e.target.value})} placeholder="Maintenance, private event, etc." />
                    </div>
                    <Button type="submit" className="w-full">Block Slot</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {blockedSlots.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Ban className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">No blocked slots</p>
                </CardContent>
              </Card>
            ) : (
              blockedSlots.map((slot) => (
                <Card key={slot.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{slot.courts?.name}</CardTitle>
                        <CardDescription>
                          {format(new Date(slot.date), 'MMMM d, yyyy')}
                        </CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteBlockedSlot(slot.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 text-sm">
                      <div>
                        <span className="font-medium">Time:</span> {slot.start_time} - {slot.end_time}
                      </div>
                      {slot.reason && (
                        <div>
                          <span className="font-medium">Reason:</span> {slot.reason}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4">
            <div className="flex justify-end mb-4">
              <Dialog open={showPricingForm} onOpenChange={setShowPricingForm}>
                <DialogTrigger asChild>
                  <Button>
                    <Clock className="mr-2 h-4 w-4" />
                    Add Pricing Rule
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Pricing Rule</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreatePricing} className="space-y-4">
                    <div>
                      <Label>Court</Label>
                      <Select value={pricingData.court_id} onValueChange={(value) => setPricingData({...pricingData, court_id: value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select court" />
                        </SelectTrigger>
                        <SelectContent>
                          {courts.map(court => (
                            <SelectItem key={court.id} value={court.id}>{court.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Rule Type</Label>
                      <Select value={pricingData.rule_type} onValueChange={(value) => setPricingData({...pricingData, rule_type: value})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="peak_hours">Peak Hours</SelectItem>
                          <SelectItem value="weekend">Weekend</SelectItem>
                          <SelectItem value="special">Special Rate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Price Multiplier</Label>
                      <Input type="number" step="0.1" min="0.5" max="5" value={pricingData.price_multiplier} onChange={(e) => setPricingData({...pricingData, price_multiplier: e.target.value})} required />
                      <p className="text-xs text-muted-foreground mt-1">e.g., 1.5 = 50% increase, 2.0 = double price</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Start Time</Label>
                        <Input type="time" value={pricingData.start_time} onChange={(e) => setPricingData({...pricingData, start_time: e.target.value})} />
                      </div>
                      <div>
                        <Label>End Time</Label>
                        <Input type="time" value={pricingData.end_time} onChange={(e) => setPricingData({...pricingData, end_time: e.target.value})} />
                      </div>
                    </div>
                    <Button type="submit" className="w-full">Create Rule</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {pricingRules.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Clock className="mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">No pricing rules configured</p>
                </CardContent>
              </Card>
            ) : (
              pricingRules.map((rule) => (
                <Card key={rule.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{rule.courts?.name}</CardTitle>
                        <CardDescription className="capitalize">{rule.rule_type.replace('_', ' ')}</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deletePricingRule(rule.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 text-sm">
                      <div>
                        <span className="font-medium">Multiplier:</span> {rule.price_multiplier}x
                      </div>
                      {rule.start_time && rule.end_time && (
                        <div>
                          <span className="font-medium">Time:</span> {rule.start_time} - {rule.end_time}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Status:</span>{' '}
                        <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                          {rule.is_active ? 'Active' : 'Inactive'}
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