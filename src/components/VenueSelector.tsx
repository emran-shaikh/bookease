import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';

interface Venue {
  id: string;
  name: string;
  city: string;
  status: string;
}

interface VenueSelectorProps {
  value: string | null;
  onChange: (venueId: string | null) => void;
  label?: string;
  disabled?: boolean;
}

export function VenueSelector({ value, onChange, label = "Link to Venue (Optional)", disabled }: VenueSelectorProps) {
  const { user } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchVenues();
    }
  }, [user]);

  async function fetchVenues() {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, city, status')
        .eq('owner_id', user?.id)
        .order('name');

      if (error) throw error;
      setVenues(data || []);
    } catch (error) {
      console.error('Error fetching venues:', error);
    } finally {
      setLoading(false);
    }
  }

  const approvedVenues = venues.filter(v => v.status === 'approved');
  const pendingVenues = venues.filter(v => v.status === 'pending');

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Building2 className="h-4 w-4" />
        {label}
      </Label>
      <Select
        value={value || 'standalone'}
        onValueChange={(val) => onChange(val === 'standalone' ? null : val)}
        disabled={disabled || loading}
      >
        <SelectTrigger>
          <SelectValue placeholder={loading ? "Loading venues..." : "Select a venue or standalone"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="standalone">
            <span className="flex items-center gap-2">
              Standalone Court (no venue)
            </span>
          </SelectItem>
          
          {approvedVenues.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Approved Venues
              </div>
              {approvedVenues.map((venue) => (
                <SelectItem key={venue.id} value={venue.id}>
                  <span className="flex items-center gap-2">
                    {venue.name}
                    <span className="text-muted-foreground text-xs">({venue.city})</span>
                  </span>
                </SelectItem>
              ))}
            </>
          )}
          
          {pendingVenues.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Pending Approval
              </div>
              {pendingVenues.map((venue) => (
                <SelectItem key={venue.id} value={venue.id}>
                  <span className="flex items-center gap-2">
                    {venue.name}
                    <Badge variant="secondary" className="text-xs">Pending</Badge>
                  </span>
                </SelectItem>
              ))}
            </>
          )}
          
          {venues.length === 0 && !loading && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No venues created yet
            </div>
          )}
        </SelectContent>
      </Select>
      
      {value && (
        <p className="text-xs text-muted-foreground">
          Court will inherit <strong>address, location, and operating hours</strong> from the selected venue. You can override hours per court if needed.
        </p>
      )}
    </div>
  );
}
