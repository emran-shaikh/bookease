import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Header } from '@/components/Header';
import { SEO } from '@/components/SEO';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Building2, Calendar, Plus, Clock, Ban, Trash2, Bell, CheckCircle, Edit, Image, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { CourtForm } from '@/components/CourtForm';
import { CourtEditForm } from '@/components/CourtEditForm';
import { OwnerBankSettings } from '@/components/OwnerBankSettings';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNotifications } from '@/hooks/useNotifications';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { XCircle, Info } from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import { formatTimeSlot12h } from '@/lib/utils';

export default function OwnerDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { notifications } = useNotifications();
  const [courts, setCourts] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
  const [pricingRules, setPricingRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState(0);
  const [showCourtForm, setShowCourtForm] = useState(false);
  const [showBlockSlotForm, setShowBlockSlotForm] = useState(false);
  const [showPricingForm, setShowPricingForm] = useState(false);
  const [editingCourt, setEditingCourt] = useState<any>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingPricingRule, setEditingPricingRule] = useState<any>(null);

  // Block slot form state
  const [blockSlotData, setBlockSlotData] = useState({
    court_id: '',
    date: '',
    start_time: '',
    end_time: '',
    reason: '',
    guest_name: '',
    guest_email: '',
    guest_phone: '',
  });

  // Pricing rule form state
  const [pricingData, setPricingData] = useState({
    court_id: '',
    rule_type: 'peak_hours',
    price_multiplier: '1.5',
    start_time: '',
    end_time: '',
    days_of_week: [] as number[],
    specific_date: '',
  });

  // Generate hour options for time selection (0-23 hours only)
  const hourOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    const period = i < 12 ? 'AM' : 'PM';
    const displayHour = i === 0 ? 12 : i > 12 ? i - 12 : i;
    return { value: `${hour}:00`, label: `${displayHour}:00 ${period}` };
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

  // Helper function to check if two time ranges overlap
  const doTimesOverlap = (start1: string, end1: string, start2: string, end2: string): boolean => {
    const parseTime = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + (m || 0);
    };
    
    const s1 = parseTime(start1);
    const e1 = parseTime(end1);
    const s2 = parseTime(start2);
    const e2 = parseTime(end2);
    
    // Slots overlap if one starts before the other ends
    return s1 < e2 && s2 < e1;
  };

  async function handleBlockSlot(e: React.FormEvent) {
    e.preventDefault();
    try {
      // Validate required fields
      if (!blockSlotData.court_id) {
        toast({ title: 'Error', description: 'Please select a court', variant: 'destructive' });
        return;
      }
      if (!blockSlotData.date) {
        toast({ title: 'Error', description: 'Please select a date', variant: 'destructive' });
        return;
      }
      if (!blockSlotData.start_time || !blockSlotData.end_time) {
        toast({ title: 'Error', description: 'Please select start and end time', variant: 'destructive' });
        return;
      }
      
      // Validate end time is after start time
      const startHour = parseInt(blockSlotData.start_time.split(':')[0]);
      const endHour = parseInt(blockSlotData.end_time.split(':')[0]);
      if (endHour <= startHour) {
        toast({ title: 'Error', description: 'End time must be after start time', variant: 'destructive' });
        return;
      }

      // Check for existing bookings that overlap with the blocked time
      const { data: existingBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('start_time, end_time, status')
        .eq('court_id', blockSlotData.court_id)
        .eq('booking_date', blockSlotData.date)
        .in('status', ['confirmed', 'pending']);

      if (bookingsError) throw bookingsError;

      // Check for overlaps with existing bookings
      const hasOverlap = existingBookings?.some(booking => 
        doTimesOverlap(
          blockSlotData.start_time, 
          blockSlotData.end_time, 
          booking.start_time.slice(0, 5), 
          booking.end_time.slice(0, 5)
        )
      );

      if (hasOverlap) {
        toast({ 
          title: 'Cannot Block Slot', 
          description: 'There are existing bookings in this time range. Please cancel them first or choose a different time.', 
          variant: 'destructive' 
        });
        return;
      }

      // Check for existing blocked slots that overlap
      const { data: existingBlocked, error: blockedError } = await supabase
        .from('blocked_slots')
        .select('start_time, end_time')
        .eq('court_id', blockSlotData.court_id)
        .eq('date', blockSlotData.date);

      if (blockedError) throw blockedError;

      const hasBlockedOverlap = existingBlocked?.some(blocked => 
        doTimesOverlap(
          blockSlotData.start_time, 
          blockSlotData.end_time, 
          blocked.start_time.slice(0, 5), 
          blocked.end_time.slice(0, 5)
        )
      );

      if (hasBlockedOverlap) {
        toast({ 
          title: 'Already Blocked', 
          description: 'This time range is already blocked.', 
          variant: 'destructive' 
        });
        return;
      }

      const insertData: any = {
        court_id: blockSlotData.court_id,
        date: blockSlotData.date,
        start_time: blockSlotData.start_time,
        end_time: blockSlotData.end_time,
        reason: blockSlotData.reason || null,
        guest_name: blockSlotData.guest_name || null,
        guest_email: blockSlotData.guest_email || null,
        guest_phone: blockSlotData.guest_phone || null,
      };

      const { error } = await supabase.from('blocked_slots').insert([insertData]);
      if (error) throw error;

      // Send notification email if guest email is provided
      if (blockSlotData.guest_email) {
        try {
          const court = courts.find(c => c.id === blockSlotData.court_id);
          await supabase.functions.invoke('send-booking-confirmation', {
            body: {
              userEmail: blockSlotData.guest_email,
              userName: blockSlotData.guest_name || 'Guest',
              courtName: court?.name || 'Court',
              bookingDate: format(new Date(blockSlotData.date), 'MMMM d, yyyy'),
              startTime: blockSlotData.start_time,
              endTime: blockSlotData.end_time,
              totalPrice: 0,
              isPendingPayment: false,
              isManualBooking: true,
            },
          });
          toast({ title: 'Success', description: 'Slot blocked and notification sent to guest' });
        } catch (emailError) {
          console.error('Failed to send guest notification:', emailError);
          toast({ title: 'Success', description: 'Slot blocked (notification failed to send)' });
        }
      } else {
        toast({ title: 'Success', description: 'Slot blocked successfully' });
      }

      setShowBlockSlotForm(false);
      setBlockSlotData({ 
        court_id: '', 
        date: '', 
        start_time: '', 
        end_time: '', 
        reason: '',
        guest_name: '',
        guest_email: '',
        guest_phone: '',
      });
      fetchOwnerData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  async function handleCreatePricing(e: React.FormEvent) {
    e.preventDefault();
    try {
      // Validate time selection for all rule types
      if (!pricingData.start_time || !pricingData.end_time) {
        toast({ title: 'Error', description: 'Please select start and end time', variant: 'destructive' });
        return;
      }

      // Validate specific date for special rule type
      if (pricingData.rule_type === 'special' && !pricingData.specific_date) {
        toast({ title: 'Error', description: 'Please select a date for special pricing', variant: 'destructive' });
        return;
      }

      // Validate days selection for peak_hours
      if (pricingData.rule_type === 'peak_hours' && pricingData.days_of_week.length === 0) {
        toast({ title: 'Error', description: 'Please select at least one day for peak hours', variant: 'destructive' });
        return;
      }

      const { error } = await supabase.from('pricing_rules').insert([{
        court_id: pricingData.court_id,
        rule_type: pricingData.rule_type,
        price_multiplier: parseFloat(pricingData.price_multiplier),
        start_time: pricingData.start_time,
        end_time: pricingData.end_time,
        days_of_week: pricingData.rule_type === 'peak_hours' && pricingData.days_of_week.length > 0 ? pricingData.days_of_week : null,
        specific_date: pricingData.rule_type === 'special' ? pricingData.specific_date : null,
      }]);
      if (error) throw error;

      toast({ title: 'Success', description: 'Pricing rule created successfully' });
      setShowPricingForm(false);
      setPricingData({ court_id: '', rule_type: 'peak_hours', price_multiplier: '1.5', start_time: '', end_time: '', days_of_week: [], specific_date: '' });
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

  function handleEditPricingRule(rule: any) {
    setEditingPricingRule(rule);
    setPricingData({
      court_id: rule.court_id,
      rule_type: rule.rule_type,
      price_multiplier: rule.price_multiplier.toString(),
      start_time: rule.start_time || '',
      end_time: rule.end_time || '',
      days_of_week: rule.days_of_week || [],
      specific_date: rule.specific_date || '',
    });
    setShowPricingForm(true);
  }

  async function handleUpdatePricing(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPricingRule) return;

    try {
      if (!pricingData.start_time || !pricingData.end_time) {
        toast({ title: 'Error', description: 'Please select start and end time', variant: 'destructive' });
        return;
      }

      if (pricingData.rule_type === 'special' && !pricingData.specific_date) {
        toast({ title: 'Error', description: 'Please select a date for special pricing', variant: 'destructive' });
        return;
      }

      if (pricingData.rule_type === 'peak_hours' && pricingData.days_of_week.length === 0) {
        toast({ title: 'Error', description: 'Please select at least one day for peak hours', variant: 'destructive' });
        return;
      }

      const { error } = await supabase.from('pricing_rules').update({
        court_id: pricingData.court_id,
        rule_type: pricingData.rule_type,
        price_multiplier: parseFloat(pricingData.price_multiplier),
        start_time: pricingData.start_time,
        end_time: pricingData.end_time,
        days_of_week: pricingData.rule_type === 'peak_hours' && pricingData.days_of_week.length > 0 ? pricingData.days_of_week : null,
        specific_date: pricingData.rule_type === 'special' ? pricingData.specific_date : null,
      }).eq('id', editingPricingRule.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Pricing rule updated successfully' });
      setShowPricingForm(false);
      setEditingPricingRule(null);
      setPricingData({ court_id: '', rule_type: 'peak_hours', price_multiplier: '1.5', start_time: '', end_time: '', days_of_week: [], specific_date: '' });
      fetchOwnerData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  function handleClosePricingForm(open: boolean) {
    if (!open) {
      setEditingPricingRule(null);
      setPricingData({ court_id: '', rule_type: 'peak_hours', price_multiplier: '1.5', start_time: '', end_time: '', days_of_week: [], specific_date: '' });
    }
    setShowPricingForm(open);
  }

  async function handleEditCourt(court: any) {
    setEditingCourt(court);
    setShowEditDialog(true);
  }

  async function handleUpdateCourt(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCourt) return;

    try {
      const { error } = await supabase
        .from('courts')
        .update({
          name: editingCourt.name,
          base_price: parseFloat(editingCourt.base_price),
          is_active: editingCourt.is_active,
        })
        .eq('id', editingCourt.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Court updated successfully' });
      setShowEditDialog(false);
      setEditingCourt(null);
      fetchOwnerData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title="Owner Dashboard"
        description="Manage your sports courts, view bookings, set pricing rules, and track earnings on BookedHours."
        keywords="owner dashboard, court management, bookings, pricing, earnings"
      />
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
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(earnings)}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="courts" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="courts">My Courts</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="settings" className="gap-1">
              <CreditCard className="h-3 w-3" />
              Payment
            </TabsTrigger>
            <TabsTrigger value="notifications">
              Notifications
              {notifications.filter(n => !n.read).length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 flex items-center justify-center p-0 text-xs">
                  {notifications.filter(n => !n.read).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="blocked">Blocked Slots</TabsTrigger>
            <TabsTrigger value="pricing">Pricing Rules</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
            <OwnerBankSettings />
          </TabsContent>

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
                    <div className="grid gap-2 text-sm mb-4">
                      <div>
                        <span className="font-medium">Sport:</span> {court.sport_type}
                      </div>
                      <div>
                        <span className="font-medium">Base Price:</span> {formatPrice(court.base_price)}/hour
                      </div>
                      <div>
                        <span className="font-medium">Active:</span>{' '}
                        {court.is_active ? 'Yes' : 'No'}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleEditCourt(court)}
                        className="flex-1"
                      >
                        Edit
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => handleDeleteCourt(court.id)}
                        className="flex-1"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

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
                      fetchOwnerData();
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
                    <div className="grid gap-2 text-sm mb-4">
                      <div>
                        <span className="font-medium">Customer:</span>{' '}
                        {booking.profiles?.full_name || booking.profiles?.email || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">Time:</span>{' '}
                        {formatTimeSlot12h(booking.start_time, booking.end_time)}
                      </div>
                      <div>
                        <span className="font-medium">Amount:</span> {formatPrice(booking.total_price)}
                      </div>
                      <div>
                        <span className="font-medium">Payment:</span>{' '}
                        <Badge variant={booking.payment_status === 'succeeded' ? 'default' : 'secondary'}>
                          {booking.payment_status}
                        </Badge>
                      </div>
                      {booking.notes && (
                        <div>
                          <span className="font-medium">Notes:</span>{' '}
                          <span className="text-muted-foreground">{booking.notes}</span>
                        </div>
                      )}
                      {booking.payment_screenshot && (
                        <div className="mt-2">
                          <span className="font-medium flex items-center gap-1 mb-1">
                            <Image className="h-3 w-3" />
                            Payment Screenshot:
                          </span>
                          <a href={booking.payment_screenshot} target="_blank" rel="noopener noreferrer">
                            <img 
                              src={booking.payment_screenshot} 
                              alt="Payment screenshot" 
                              className="w-32 h-24 object-cover rounded border hover:opacity-80 transition-opacity cursor-pointer"
                            />
                          </a>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4">
                      {booking.status === 'pending' && booking.payment_status === 'pending' && (
                        <Button 
                          size="sm" 
                          className="flex-1"
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

                              // Create in-app notification
                              await supabase.from('notifications').insert([
                                {
                                  user_id: booking.user_id,
                                  title: '✅ Booking Confirmed',
                                  message: `Your booking for ${booking.courts?.name} on ${format(new Date(booking.booking_date), 'MMM d, yyyy')} has been confirmed!`,
                                  type: 'success',
                                  related_court_id: booking.court_id,
                                }
                              ]);

                              // Send email notification to customer
                              try {
                                await supabase.functions.invoke('send-booking-confirmation', {
                                  body: {
                                    userEmail: booking.profiles?.email,
                                    userName: booking.profiles?.full_name || 'Customer',
                                    courtName: booking.courts?.name,
                                    bookingDate: format(new Date(booking.booking_date), 'MMMM d, yyyy'),
                                    startTime: booking.start_time,
                                    endTime: booking.end_time,
                                    totalPrice: parseFloat(booking.total_price),
                                    isPendingPayment: false, // Payment is now confirmed
                                  },
                                });
                              } catch (emailError) {
                                console.error('Failed to send confirmation email:', emailError);
                              }

                              toast({ 
                                title: 'Success', 
                                description: 'Booking confirmed and customer notified via email' 
                              });
                              fetchOwnerData();
                            } catch (error: any) {
                              toast({ 
                                title: 'Error', 
                                description: error.message, 
                                variant: 'destructive' 
                              });
                            }
                          }}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Confirm
                        </Button>
                      )}
                      {(booking.status === 'confirmed' || booking.status === 'pending') && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1"
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
                                  message: `Your booking for ${booking.courts?.name} on ${format(new Date(booking.booking_date), 'MMM d, yyyy')} has been cancelled by the court owner.`,
                                  type: 'error',
                                  related_court_id: booking.court_id,
                                }
                              ]);

                              toast({ title: 'Success', description: 'Booking cancelled and customer notified' });
                              fetchOwnerData();
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
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>Stay updated on your court status changes</CardDescription>
              </CardHeader>
              <CardContent>
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Bell className="mb-4 h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">No notifications yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((notification) => {
                      const getIcon = () => {
                        switch (notification.type) {
                          case 'success':
                            return <CheckCircle className="h-5 w-5 text-green-500" />;
                          case 'error':
                            return <XCircle className="h-5 w-5 text-red-500" />;
                          default:
                            return <Info className="h-5 w-5 text-blue-500" />;
                        }
                      };

                      return (
                        <Alert
                          key={notification.id}
                          className={!notification.read ? 'border-primary bg-accent/50' : ''}
                        >
                          <div className="flex items-start gap-3">
                            {getIcon()}
                            <div className="flex-1 space-y-1">
                              <AlertTitle className="font-semibold">
                                {notification.title}
                              </AlertTitle>
                              <AlertDescription>{notification.message}</AlertDescription>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(notification.created_at), 'MMM d, yyyy h:mm a')}
                              </p>
                            </div>
                            {!notification.read && (
                              <Badge variant="default" className="ml-auto">New</Badge>
                            )}
                          </div>
                        </Alert>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
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
                        <Select 
                          value={blockSlotData.start_time} 
                          onValueChange={(value) => setBlockSlotData({...blockSlotData, start_time: value})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select start hour" />
                          </SelectTrigger>
                          <SelectContent>
                            {hourOptions.map((hour) => (
                              <SelectItem key={hour.value} value={hour.value}>
                                {hour.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>End Time</Label>
                        <Select 
                          value={blockSlotData.end_time} 
                          onValueChange={(value) => setBlockSlotData({...blockSlotData, end_time: value})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select end hour" />
                          </SelectTrigger>
                          <SelectContent>
                            {hourOptions.map((hour) => (
                              <SelectItem key={hour.value} value={hour.value}>
                                {hour.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Reason (optional)</Label>
                      <Input value={blockSlotData.reason} onChange={(e) => setBlockSlotData({...blockSlotData, reason: e.target.value})} placeholder="Maintenance, private event, etc." />
                    </div>
                    
                    <div className="border-t pt-4 mt-4">
                      <p className="text-sm text-muted-foreground mb-3">Block for a guest (optional) - they will be notified</p>
                      <div className="space-y-3">
                        <div>
                          <Label>Guest Name</Label>
                          <Input 
                            value={blockSlotData.guest_name} 
                            onChange={(e) => setBlockSlotData({...blockSlotData, guest_name: e.target.value})} 
                            placeholder="Guest name" 
                          />
                        </div>
                        <div>
                          <Label>Guest Email</Label>
                          <Input 
                            type="email"
                            value={blockSlotData.guest_email} 
                            onChange={(e) => setBlockSlotData({...blockSlotData, guest_email: e.target.value})} 
                            placeholder="guest@example.com" 
                          />
                        </div>
                        <div>
                          <Label>Guest Phone</Label>
                          <Input 
                            type="tel"
                            value={blockSlotData.guest_phone} 
                            onChange={(e) => setBlockSlotData({...blockSlotData, guest_phone: e.target.value})} 
                            placeholder="+1 234 567 8900" 
                          />
                        </div>
                      </div>
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
                        <span className="font-medium">Time:</span> {formatTimeSlot12h(slot.start_time, slot.end_time)}
                      </div>
                      {slot.reason && (
                        <div>
                          <span className="font-medium">Reason:</span> {slot.reason}
                        </div>
                      )}
                      {(slot.guest_name || slot.guest_email || slot.guest_phone) && (
                        <div className="border-t pt-2 mt-2">
                          <span className="font-medium text-primary">Reserved for:</span>
                          {slot.guest_name && <div className="ml-2">{slot.guest_name}</div>}
                          {slot.guest_email && <div className="ml-2 text-muted-foreground">{slot.guest_email}</div>}
                          {slot.guest_phone && <div className="ml-2 text-muted-foreground">{slot.guest_phone}</div>}
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
              <Dialog open={showPricingForm} onOpenChange={handleClosePricingForm}>
                <DialogTrigger asChild>
                  <Button>
                    <Clock className="mr-2 h-4 w-4" />
                    Add Pricing Rule
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingPricingRule ? 'Edit Pricing Rule' : 'Create Pricing Rule'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={editingPricingRule ? handleUpdatePricing : handleCreatePricing} className="space-y-4">
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
                          <SelectItem value="peak_hours">Peak Hours (Recurring)</SelectItem>
                          <SelectItem value="weekend">Weekend Rate</SelectItem>
                          <SelectItem value="special">Special Rate (Specific Date)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        {pricingData.rule_type === 'peak_hours' && 'Apply peak pricing during specific hours on selected days'}
                        {pricingData.rule_type === 'weekend' && 'Apply special pricing on weekends'}
                        {pricingData.rule_type === 'special' && 'Apply pricing for a specific date (e.g., holidays)'}
                      </p>
                    </div>
                    <div>
                      <Label>Price Multiplier</Label>
                      <Input 
                        type="number" 
                        step="0.1" 
                        min="0.5" 
                        max="5" 
                        value={pricingData.price_multiplier} 
                        onChange={(e) => setPricingData({...pricingData, price_multiplier: e.target.value})} 
                        required 
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Current base price × {pricingData.price_multiplier} = New price
                        <br />
                        Examples: 1.5 = +50%, 2.0 = double price, 0.8 = 20% discount
                      </p>
                    </div>
                    
                    {pricingData.rule_type === 'special' && (
                      <div>
                        <Label>Date</Label>
                        <Input 
                          type="date" 
                          value={pricingData.specific_date} 
                          onChange={(e) => setPricingData({...pricingData, specific_date: e.target.value})} 
                          min={new Date().toISOString().split('T')[0]}
                          required
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Select the specific date for this special pricing
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Start Time</Label>
                        <Select 
                          value={pricingData.start_time} 
                          onValueChange={(value) => setPricingData({...pricingData, start_time: value})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select start hour" />
                          </SelectTrigger>
                          <SelectContent>
                            {hourOptions.map((hour) => (
                              <SelectItem key={hour.value} value={hour.value}>
                                {hour.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>End Time</Label>
                        <Select 
                          value={pricingData.end_time} 
                          onValueChange={(value) => setPricingData({...pricingData, end_time: value})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select end hour" />
                          </SelectTrigger>
                          <SelectContent>
                            {hourOptions.map((hour) => (
                              <SelectItem key={hour.value} value={hour.value}>
                                {hour.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Time selection is 1-hour based. Price applies to slots starting from Start Time until End Time.
                    </p>

                    {pricingData.rule_type === 'peak_hours' && (
                      <div>
                        <Label className="mb-3 block">Apply on Days (Select multiple)</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: 'Sunday', value: 0 },
                            { label: 'Monday', value: 1 },
                            { label: 'Tuesday', value: 2 },
                            { label: 'Wednesday', value: 3 },
                            { label: 'Thursday', value: 4 },
                            { label: 'Friday', value: 5 },
                            { label: 'Saturday', value: 6 },
                          ].map((day) => (
                            <Button
                              key={day.value}
                              type="button"
                              variant={pricingData.days_of_week.includes(day.value) ? 'default' : 'outline'}
                              className="w-full"
                              onClick={() => {
                                const days = pricingData.days_of_week.includes(day.value)
                                  ? pricingData.days_of_week.filter(d => d !== day.value)
                                  : [...pricingData.days_of_week, day.value];
                                setPricingData({...pricingData, days_of_week: days});
                              }}
                            >
                              {day.label}
                            </Button>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Select which days of the week this rule applies to
                        </p>
                      </div>
                    )}
                    
                    <Button type="submit" className="w-full">
                      {editingPricingRule ? 'Update Pricing Rule' : 'Create Pricing Rule'}
                    </Button>
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
                        <CardTitle className="flex items-center gap-2">
                          {rule.courts?.name}
                          {rule.price_multiplier > 1.5 && <Badge variant="destructive">High Rate</Badge>}
                          {rule.price_multiplier <= 1.2 && rule.price_multiplier > 1 && <Badge>Moderate</Badge>}
                          {rule.price_multiplier < 1 && <Badge variant="secondary">Discount</Badge>}
                        </CardTitle>
                        <CardDescription className="capitalize">
                          {rule.rule_type.replace('_', ' ')}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEditPricingRule(rule)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deletePricingRule(rule.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="font-medium">Price Multiplier:</span> 
                        <span className="text-lg font-bold text-primary">{rule.price_multiplier}×</span>
                      </div>
                      {rule.specific_date && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">Date:</span> {format(new Date(rule.specific_date), 'MMM d, yyyy')}
                        </div>
                      )}
                      {rule.start_time && rule.end_time && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">Time:</span> {formatTimeSlot12h(rule.start_time, rule.end_time)}
                        </div>
                      )}
                      {rule.days_of_week && rule.days_of_week.length > 0 && (
                        <div>
                          <span className="font-medium">Days:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {rule.days_of_week.map((day: number) => (
                              <Badge key={day} variant="outline">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Status:</span>
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