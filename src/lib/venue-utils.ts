// Venue-Court inheritance utility functions

export interface Venue {
  id: string;
  owner_id: string;
  name: string;
  description?: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  images?: string[];
  amenities?: string[];
  slug: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  is_active: boolean;
  default_opening_time?: string;
  default_closing_time?: string;
  contact_email?: string;
  contact_phone?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ResolvedCourtData {
  address: string;
  city: string;
  state: string;
  zip_code: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  images: string[];
  amenities: string[];
  opening_time: string;
  closing_time: string;
  venue?: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Resolves court data by inheriting from venue when applicable.
 * Courts linked to a venue inherit address, location, and merge images/amenities.
 */
export function resolveCourtData(court: any, venue?: Venue | null): ResolvedCourtData {
  const hasVenue = !!venue;
  
  return {
    // Location data: inherit from venue if linked
    address: hasVenue ? venue.address : (court.address || ''),
    city: hasVenue ? venue.city : (court.city || ''),
    state: hasVenue ? venue.state : (court.state || ''),
    zip_code: hasVenue ? venue.zip_code : (court.zip_code || ''),
    location: hasVenue ? venue.location : (court.location || ''),
    latitude: hasVenue ? (venue.latitude ?? null) : (court.latitude ?? null),
    longitude: hasVenue ? (venue.longitude ?? null) : (court.longitude ?? null),
    
    // Images: combine venue images with court-specific images
    images: [
      ...(hasVenue ? (venue.images || []) : []),
      ...(court.court_specific_images || court.images || [])
    ].filter(Boolean),
    
    // Amenities: combine venue amenities with court-specific amenities
    amenities: [
      ...(hasVenue ? (venue.amenities || []) : []),
      ...(court.court_specific_amenities || court.amenities || [])
    ].filter(Boolean),
    
    // Operating hours: use court override if set, otherwise inherit from venue or use court default
    opening_time: court.opening_time_override || 
      (hasVenue ? venue.default_opening_time : court.opening_time) || 
      '06:00',
    closing_time: court.closing_time_override || 
      (hasVenue ? venue.default_closing_time : court.closing_time) || 
      '22:00',
    
    // Venue reference for display
    venue: hasVenue ? { 
      id: venue.id, 
      name: venue.name, 
      slug: venue.slug 
    } : undefined
  };
}

/**
 * Check if a court is linked to a venue
 */
export function isVenueCourt(court: any): boolean {
  return !!court.venue_id;
}

/**
 * Get display location for a court (venue name or standalone location)
 */
export function getCourtDisplayLocation(court: any, venue?: Venue | null): string {
  if (venue) {
    return `${venue.name} • ${venue.city}`;
  }
  return `${court.location || court.city || 'Unknown Location'}`;
}

/**
 * Format court count for venue display
 */
export function formatCourtCount(count: number): string {
  if (count === 0) return 'No courts';
  if (count === 1) return '1 court';
  return `${count} courts`;
}

/**
 * Get unique sport types from courts
 */
export function getUniqueSportTypes(courts: any[]): string[] {
  return [...new Set(courts.map(c => c.sport_type).filter(Boolean))];
}

/**
 * Get lowest price from courts
 */
export function getLowestPrice(courts: any[]): number {
  if (courts.length === 0) return 0;
  return Math.min(...courts.map(c => parseFloat(c.base_price) || 0));
}
