import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface SlotLock {
  id: string;
  court_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  user_id: string;
  expires_at: string;
}

export function useSlotLock(courtId: string, date: Date | null) {
  const { user } = useAuth();
  const [lockedSlots, setLockedSlots] = useState<SlotLock[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch and cleanup expired locks
  const fetchLockedSlots = async () => {
    if (!courtId || !date) return;

    setLoading(true);
    try {
      // First cleanup expired locks
      await supabase.rpc('cleanup_expired_slot_locks');

      // Then fetch active locks for this court and date
      const { data, error } = await supabase
        .from('slot_locks')
        .select('*')
        .eq('court_id', courtId)
        .eq('booking_date', date.toISOString().split('T')[0])
        .gt('expires_at', new Date().toISOString());

      if (error) throw error;
      setLockedSlots(data || []);
    } catch (error) {
      console.error('Error fetching locked slots:', error);
    } finally {
      setLoading(false);
    }
  };

  // Create a slot lock
  const lockSlot = async (startTime: string, endTime: string) => {
    if (!user || !date) return null;

    try {
      const { data, error } = await supabase
        .from('slot_locks')
        .insert({
          court_id: courtId,
          booking_date: date.toISOString().split('T')[0],
          start_time: startTime,
          end_time: endTime,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      
      // Refresh locks
      await fetchLockedSlots();
      
      return data;
    } catch (error) {
      console.error('Error locking slot:', error);
      return null;
    }
  };

  // Release a slot lock
  const unlockSlot = async (lockId: string) => {
    try {
      const { error } = await supabase
        .from('slot_locks')
        .delete()
        .eq('id', lockId);

      if (error) throw error;
      
      // Refresh locks
      await fetchLockedSlots();
    } catch (error) {
      console.error('Error unlocking slot:', error);
    }
  };

  // Check if a slot is locked by current user
  const isLockedByCurrentUser = (startTime: string, endTime: string) => {
    return lockedSlots.some(
      lock =>
        lock.user_id === user?.id &&
        lock.start_time === startTime &&
        lock.end_time === endTime
    );
  };

  // Check if a slot is locked by anyone
  const isSlotLocked = (startTime: string, endTime: string) => {
    return lockedSlots.some(
      lock =>
        lock.start_time === startTime &&
        lock.end_time === endTime
    );
  };

  // Get lock for current user's slot
  const getCurrentUserLock = (startTime: string, endTime: string) => {
    return lockedSlots.find(
      lock =>
        lock.user_id === user?.id &&
        lock.start_time === startTime &&
        lock.end_time === endTime
    );
  };

  useEffect(() => {
    fetchLockedSlots();
    
    // Refresh locks every 30 seconds
    const interval = setInterval(fetchLockedSlots, 30000);
    
    return () => clearInterval(interval);
  }, [courtId, date]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!courtId || !date) return;

    const channel = supabase
      .channel('slot_locks_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'slot_locks',
          filter: `court_id=eq.${courtId}`,
        },
        () => {
          fetchLockedSlots();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [courtId, date]);

  return {
    lockedSlots,
    loading,
    lockSlot,
    unlockSlot,
    isLockedByCurrentUser,
    isSlotLocked,
    getCurrentUserLock,
    refreshLocks: fetchLockedSlots,
  };
}
