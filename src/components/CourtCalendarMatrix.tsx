import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Loader2, CalendarDays } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { toast } from 'sonner';
import { formatPrice } from '@/lib/currency';

type Props = { ownerId?: string };

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const toHour = (t?: string | null) => (t ? parseInt(t.slice(0, 2), 10) : 0);
const endHour = (t?: string | null) => {
  if (!t) return 24;
  const h = toHour(t);
  return h === 0 ? 24 : h;
};
const hourLabel = (h: number) => {
  const hh = h % 24;
  const p = hh < 12 ? 'AM' : 'PM';
  const d = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${d} ${p}`;
};
const hhmm = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;

const SOURCES = ['Walk-in', 'Phone', 'WhatsApp', 'Broker', 'Owner'];

type Cell =
  | { kind: 'booking'; item: any; start: boolean }
  | { kind: 'block'; item: any; start: boolean }
  | null;

export function CourtCalendarMatrix({ ownerId }: Props) {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [venues, setVenues] = useState<any[]>([]);
  const [courts, setCourts] = useState<any[]>([]);
  const [venueId, setVenueId] = useState<string>('all');
  const [bookings, setBookings] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lockRef = useRef(false);

  const [newSlot, setNewSlot] = useState<{ court: any; hour: number } | null>(null);
  const [form, setForm] = useState({ mode: 'walkin', endHour: 1, name: '', phone: '', source: 'Walk-in', broker: '', reason: '' });
  const [selected, setSelected] = useState<{ kind: 'booking' | 'block'; item: any } | null>(null);

  // Load courts/venues
  useEffect(() => {
    (async () => {
      let cq = supabase.from('courts').select('id, name, venue_id, sport_type, base_price').order('name');
      let vq = supabase.from('venues').select('id, name').order('name');
      if (ownerId) {
        cq = cq.eq('owner_id', ownerId);
        vq = vq.eq('owner_id', ownerId);
      }
      const [c, v] = await Promise.all([cq, vq]);
      setCourts(c.data || []);
      setVenues(v.data || []);
      if ((v.data || []).length > 0) setVenueId(v.data![0].id);
    })();
  }, [ownerId]);

  const visibleCourts = useMemo(
    () => (venueId === 'all' ? courts : courts.filter((c) => c.venue_id === venueId)),
    [courts, venueId],
  );
  const courtIds = useMemo(() => visibleCourts.map((c) => c.id), [visibleCourts]);

  const fetchDay = useCallback(async () => {
    if (courtIds.length === 0) {
      setBookings([]); setBlocks([]); setRules([]); setLoading(false);
      return;
    }
    const [b, bl, r] = await Promise.all([
      supabase.from('bookings').select('*').in('court_id', courtIds).eq('booking_date', date).neq('status', 'cancelled'),
      supabase.from('blocked_slots').select('*').in('court_id', courtIds).eq('date', date),
      supabase.from('pricing_rules').select('*').in('court_id', courtIds).eq('is_active', true),
    ]);
    setBookings(b.data || []);
    setBlocks(bl.data || []);
    setRules(r.data || []);
    setLoading(false);
  }, [courtIds, date]);

  useEffect(() => { setLoading(true); fetchDay(); }, [fetchDay]);

  // Realtime: refresh on any change
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(t); t = setTimeout(fetchDay, 250); };
    const ch = supabase
      .channel(`calendar-matrix-${ownerId || 'all'}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_slots' }, refresh)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [fetchDay, ownerId]);

  const dow = new Date(`${date}T00:00:00`).getDay();

  const peakFor = (courtId: string, h: number) =>
    rules.find((r) => {
      if (r.court_id !== courtId) return false;
      if (r.rule_type === 'specific_date' && r.specific_date !== date) return false;
      if (r.rule_type === 'weekend' && !(dow === 0 || dow === 6)) return false;
      if (r.days_of_week?.length && !r.days_of_week.includes(dow)) return false;
      if (r.start_time && r.end_time) {
        const s = toHour(r.start_time); const e = endHour(r.end_time);
        return s <= e ? h >= s && h < e : h >= s || h < e;
      }
      return r.rule_type !== 'peak_hours';
    });

  const cellFor = (courtId: string, h: number): Cell => {
    const b = bookings.find((x) => x.court_id === courtId && toHour(x.start_time) <= h && h < endHour(x.end_time));
    if (b) return { kind: 'booking', item: b, start: toHour(b.start_time) === h };
    const bl = blocks.find((x) => x.court_id === courtId && toHour(x.start_time) <= h && h < endHour(x.end_time));
    if (bl) return { kind: 'block', item: bl, start: toHour(bl.start_time) === h };
    return null;
  };

  const isFree = (courtId: string, from: number, to: number) => {
    for (let h = from; h < to; h++) if (cellFor(courtId, h)) return false;
    return true;
  };

  const openNew = (court: any, hour: number) => {
    setForm({ mode: 'walkin', endHour: hour + 1, name: '', phone: '', source: 'Walk-in', broker: '', reason: '' });
    setNewSlot({ court, hour });
  };

  const saveNew = async () => {
    if (!newSlot || lockRef.current) return;
    const { court, hour } = newSlot;
    if (form.endHour <= hour) return toast.error('End time must be after start time');
    if (form.mode === 'walkin' && (!form.name.trim() || !form.phone.trim()))
      return toast.error('Customer name and phone are required');
    if (form.mode === 'walkin' && form.source === 'Broker' && !form.broker.trim())
      return toast.error('Please enter the broker name');
    lockRef.current = true; setBusy(true);
    try {
      // Re-check against latest data to avoid double booking between staff
      const [b, bl] = await Promise.all([
        supabase.from('bookings').select('start_time,end_time').eq('court_id', court.id).eq('booking_date', date).neq('status', 'cancelled'),
        supabase.from('blocked_slots').select('start_time,end_time').eq('court_id', court.id).eq('date', date),
      ]);
      const clash = [...(b.data || []), ...(bl.data || [])].some(
        (x) => toHour(x.start_time) < form.endHour && endHour(x.end_time) > hour,
      );
      if (clash) {
        toast.error('This time was just taken by someone else. Pick another slot.');
        fetchDay();
        return;
      }
      const sourceLabel = form.source === 'Broker' ? `Broker: ${form.broker.trim()}` : form.source;
      const payload: any = {
        court_id: court.id,
        date,
        start_time: hhmm(hour),
        end_time: form.endHour === 24 ? '23:59' : hhmm(form.endHour),
        reason: form.mode === 'walkin' ? `Booking · ${sourceLabel}` : (form.reason.trim() || 'Blocked'),
      };
      if (form.mode === 'walkin') {
        payload.guest_name = form.name.trim();
        payload.guest_phone = form.phone.trim();
      }
      const { error } = await supabase.from('blocked_slots').insert(payload);
      if (error) throw error;
      toast.success(form.mode === 'walkin' ? 'Booking added to calendar' : 'Time blocked');
      setNewSlot(null);
      fetchDay();
    } catch (e: any) {
      toast.error(e.message || 'Could not save');
    } finally {
      lockRef.current = false; setBusy(false);
    }
  };

  const updateBooking = async (status: 'confirmed' | 'cancelled') => {
    if (!selected || lockRef.current) return;
    lockRef.current = true; setBusy(true);
    const { error } = await supabase.from('bookings').update({ status }).eq('id', selected.item.id);
    lockRef.current = false; setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(status === 'confirmed' ? 'Booking confirmed' : 'Booking cancelled');
    setSelected(null); fetchDay();
  };

  const removeBlock = async () => {
    if (!selected || lockRef.current) return;
    lockRef.current = true; setBusy(true);
    const { error } = await supabase.from('blocked_slots').delete().eq('id', selected.item.id);
    lockRef.current = false; setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Slot is free again');
    setSelected(null); fetchDay();
  };

  const courtName = (id: string) => courts.find((c) => c.id === id)?.name || 'Court';

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Court Calendar</CardTitle>
          <CardDescription>All courts side by side. Tap an empty slot to add a booking or block it. Updates live for everyone.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setDate(format(addDays(new Date(`${date}T00:00:00`), -1), 'yyyy-MM-dd'))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto" />
          <Button variant="outline" size="icon" onClick={() => setDate(format(addDays(new Date(`${date}T00:00:00`), 1), 'yyyy-MM-dd'))} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="secondary" size="sm" onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))}>Today</Button>
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Venue" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All venues</SelectItem>
              {venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary" /> Confirmed</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-primary bg-primary/20" /> Pending payment</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-secondary border" /> Staff / broker booking</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-destructive/80" /> Blocked</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-accent border" /> Peak hours</span>
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : visibleCourts.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No courts found.</p>
        ) : (
          <div className="max-h-[70vh] overflow-auto border-t sm:rounded-md sm:border">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-background">
                <tr>
                  <th className="sticky left-0 z-30 w-16 border-b bg-background p-2 text-left font-medium text-muted-foreground">Time</th>
                  {visibleCourts.map((c) => (
                    <th key={c.id} className="min-w-[130px] border-b border-l p-2 text-left font-semibold">{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map((h) => (
                  <tr key={h}>
                    <td className="sticky left-0 z-10 border-b bg-background p-2 align-top text-muted-foreground">{hourLabel(h)}</td>
                    {visibleCourts.map((c) => {
                      const cell = cellFor(c.id, h);
                      const peak = peakFor(c.id, h);
                      if (!cell) {
                        return (
                          <td key={c.id} className={`h-11 border-b border-l p-0 ${peak ? 'bg-accent/60' : ''}`}>
                            <button
                              type="button"
                              onClick={() => openNew(c, h)}
                              className="flex h-full min-h-11 w-full items-center justify-between px-2 text-left text-muted-foreground transition-colors hover:bg-muted"
                            >
                              <span className="opacity-0 hover:opacity-100">+ Add</span>
                              {peak && <span className="text-[10px] font-medium text-accent-foreground">Peak ×{Number(peak.price_multiplier)}</span>}
                            </button>
                          </td>
                        );
                      }
                      const isBooking = cell.kind === 'booking';
                      const it = cell.item;
                      const staff = !isBooking && it.guest_name;
                      const cls = isBooking
                        ? it.status === 'confirmed' || it.status === 'completed'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-primary/20 text-foreground border-l-2 border-l-primary'
                        : staff
                          ? 'bg-secondary text-secondary-foreground'
                          : 'bg-destructive/80 text-destructive-foreground';
                      return (
                        <td key={c.id} className="h-11 border-b border-l p-0">
                          <button
                            type="button"
                            onClick={() => setSelected({ kind: cell.kind, item: it })}
                            className={`flex h-full min-h-11 w-full flex-col justify-center px-2 text-left ${cls}`}
                          >
                            {cell.start ? (
                              <>
                                <span className="truncate font-semibold">
                                  {isBooking ? (it.status === 'confirmed' || it.status === 'completed' ? 'Confirmed' : 'Pending') : staff ? it.guest_name : 'Blocked'}
                                </span>
                                <span className="truncate text-[10px] opacity-80">
                                  {isBooking ? `Website · ${formatPrice(Number(it.total_price))}` : it.reason || ''}
                                </span>
                              </>
                            ) : <span className="text-[10px] opacity-60">↳</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* New slot dialog */}
      <Dialog open={!!newSlot} onOpenChange={(o) => !o && setNewSlot(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{newSlot?.court.name} · {hourLabel(newSlot?.hour ?? 0)}</DialogTitle>
            <DialogDescription>{format(new Date(`${date}T00:00:00`), 'EEEE, d MMM yyyy')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button variant={form.mode === 'walkin' ? 'default' : 'outline'} onClick={() => setForm({ ...form, mode: 'walkin' })}>Add booking</Button>
              <Button variant={form.mode === 'block' ? 'destructive' : 'outline'} onClick={() => setForm({ ...form, mode: 'block' })}>Block time</Button>
            </div>
            <div className="space-y-1">
              <Label>Until</Label>
              <Select value={String(form.endHour)} onValueChange={(v) => setForm({ ...form, endHour: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {newSlot && Array.from({ length: Math.min(8, 24 - newSlot.hour) }, (_, i) => newSlot.hour + i + 1).map((e) => (
                    <SelectItem key={e} value={String(e)} disabled={!isFree(newSlot.court.id, newSlot.hour, e)}>
                      {hourLabel(e)} ({e - newSlot.hour}h)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.mode === 'walkin' ? (
              <>
                <div className="space-y-1"><Label>Customer name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Phone</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="03xx xxxxxxx" /></div>
                <div className="space-y-1">
                  <Label>Booked via</Label>
                  <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {form.source === 'Broker' && (
                  <div className="space-y-1"><Label>Broker name</Label><Input value={form.broker} onChange={(e) => setForm({ ...form, broker: e.target.value })} /></div>
                )}
              </>
            ) : (
              <div className="space-y-1"><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Maintenance, tournament…" /></div>
            )}
            <Button className="w-full" onClick={saveNew} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Details dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{courtName(selected.item.court_id)}</DialogTitle>
                <DialogDescription>
                  {format(new Date(`${date}T00:00:00`), 'd MMM yyyy')} · {hourLabel(toHour(selected.item.start_time))} – {hourLabel(endHour(selected.item.end_time))}
                </DialogDescription>
              </DialogHeader>
              {selected.kind === 'booking' ? (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{selected.item.status}</Badge>
                    <Badge variant="outline">Payment: {selected.item.payment_status}</Badge>
                    <Badge variant="secondary">Website</Badge>
                  </div>
                  <p>Amount: <strong>{formatPrice(Number(selected.item.total_price))}</strong></p>
                  {selected.item.notes && <p className="text-muted-foreground">{selected.item.notes}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => updateBooking('confirmed')} disabled={busy || selected.item.status === 'confirmed'}>Confirm</Button>
                    <Button variant="destructive" onClick={() => updateBooking('cancelled')} disabled={busy}>Cancel booking</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  {selected.item.guest_name ? (
                    <>
                      <p>Customer: <strong>{selected.item.guest_name}</strong></p>
                      {selected.item.guest_phone && <p>Phone: <a className="text-primary underline" href={`tel:${selected.item.guest_phone}`}>{selected.item.guest_phone}</a></p>}
                    </>
                  ) : null}
                  <p className="text-muted-foreground">{selected.item.reason || 'Blocked'}</p>
                  <Button variant="destructive" className="w-full" onClick={removeBlock} disabled={busy}>
                    {selected.item.guest_name ? 'Cancel this booking' : 'Unblock'}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
