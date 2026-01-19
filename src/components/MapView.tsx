import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, MapPin } from 'lucide-react';
import { formatPrice } from '@/lib/currency';
import { formatCourtCount, getUniqueSportTypes, getLowestPrice } from '@/lib/venue-utils';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom venue marker icon
const venueIcon = new L.DivIcon({
  className: 'custom-venue-marker',
  html: `<div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg border-2 border-background">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
      <path d="M9 22v-4h6v4"/>
      <path d="M8 6h.01"/>
      <path d="M16 6h.01"/>
      <path d="M12 6h.01"/>
      <path d="M12 10h.01"/>
      <path d="M12 14h.01"/>
      <path d="M16 10h.01"/>
      <path d="M16 14h.01"/>
      <path d="M8 10h.01"/>
      <path d="M8 14h.01"/>
    </svg>
  </div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

// Custom court marker icon
const courtIcon = new L.DivIcon({
  className: 'custom-court-marker',
  html: `<div class="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-secondary-foreground shadow-lg border-2 border-background">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// User location marker icon
const userLocationIcon = new L.DivIcon({
  className: 'custom-user-marker',
  html: `<div class="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white shadow-lg border-2 border-white animate-pulse">
    <div class="w-2 h-2 rounded-full bg-white"></div>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

interface Court {
  id: string;
  slug: string;
  name: string;
  location: string;
  city: string;
  base_price: number;
  sport_type: string;
  images: string[] | null;
  latitude: number | null;
  longitude: number | null;
  venue_id: string | null;
}

interface Venue {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  city: string;
  location: string;
  images: string[] | null;
  latitude: number | null;
  longitude: number | null;
  courts: Court[];
}

interface MapViewProps {
  venues: Venue[];
  courts: Court[];
  userLocation: { lat: number; lng: number } | null;
  className?: string;
}

// Component to recenter map
function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

// Component to fit bounds
function FitBounds({ venues, courts, userLocation }: { venues: Venue[]; courts: Court[]; userLocation: { lat: number; lng: number } | null }) {
  const map = useMap();
  
  useEffect(() => {
    const points: [number, number][] = [];
    
    venues.forEach(v => {
      if (v.latitude && v.longitude) {
        points.push([v.latitude, v.longitude]);
      }
    });
    
    courts.forEach(c => {
      if (c.latitude && c.longitude) {
        points.push([c.latitude, c.longitude]);
      }
    });
    
    if (userLocation) {
      points.push([userLocation.lat, userLocation.lng]);
    }
    
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [venues, courts, userLocation, map]);
  
  return null;
}

export default function MapView({ venues, courts, userLocation, className = '' }: MapViewProps) {
  const navigate = useNavigate();
  
  // Default center to Karachi if no user location
  const defaultCenter: [number, number] = userLocation 
    ? [userLocation.lat, userLocation.lng] 
    : [24.8607, 67.0011];
  
  // Filter items with valid coordinates
  const venuesWithCoords = venues.filter(v => v.latitude && v.longitude);
  const courtsWithCoords = courts.filter(c => c.latitude && c.longitude);
  
  const hasAnyMarkers = venuesWithCoords.length > 0 || courtsWithCoords.length > 0;

  if (!hasAnyMarkers && !userLocation) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded-xl ${className}`}>
        <div className="text-center p-8">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No locations available</h3>
          <p className="text-sm text-muted-foreground">
            Venues and courts without coordinates won't appear on the map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden border shadow-lg ${className}`}>
      <MapContainer
        center={defaultCenter}
        zoom={12}
        className="h-full w-full min-h-[400px]"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <FitBounds venues={venuesWithCoords} courts={courtsWithCoords} userLocation={userLocation} />
        
        {/* User location marker */}
        {userLocation && (
          <Marker 
            position={[userLocation.lat, userLocation.lng]} 
            icon={userLocationIcon}
          >
            <Popup>
              <div className="text-center">
                <strong>Your Location</strong>
              </div>
            </Popup>
          </Marker>
        )}
        
        {/* Venue markers */}
        {venuesWithCoords.map(venue => (
          <Marker
            key={`venue-${venue.id}`}
            position={[venue.latitude!, venue.longitude!]}
            icon={venueIcon}
          >
            <Popup>
              <div className="min-w-[200px] max-w-[280px]">
                {venue.images?.[0] && (
                  <img 
                    src={venue.images[0]} 
                    alt={venue.name}
                    className="w-full h-24 object-cover rounded-t-md -mt-3 -mx-3 mb-2"
                    style={{ width: 'calc(100% + 24px)' }}
                  />
                )}
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-primary text-primary-foreground text-xs">
                    <Building2 className="h-3 w-3 mr-1" />
                    Venue
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {formatCourtCount(venue.courts.length)}
                  </Badge>
                </div>
                <h3 className="font-semibold text-sm mb-1">{venue.name}</h3>
                <p className="text-xs text-muted-foreground mb-2 flex items-center">
                  <MapPin className="h-3 w-3 mr-1" />
                  {venue.city}
                </p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {getUniqueSportTypes(venue.courts).slice(0, 2).map(sport => (
                    <Badge key={sport} variant="secondary" className="text-xs">
                      {sport}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-primary">
                    From {formatPrice(getLowestPrice(venue.courts))}/hr
                  </span>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => navigate(`/venues/${venue.slug}`)}
                  >
                    View
                  </Button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
        
        {/* Court markers */}
        {courtsWithCoords.map(court => (
          <Marker
            key={`court-${court.id}`}
            position={[court.latitude!, court.longitude!]}
            icon={courtIcon}
          >
            <Popup>
              <div className="min-w-[180px] max-w-[250px]">
                {court.images?.[0] && (
                  <img 
                    src={court.images[0]} 
                    alt={court.name}
                    className="w-full h-20 object-cover rounded-t-md -mt-3 -mx-3 mb-2"
                    style={{ width: 'calc(100% + 24px)' }}
                  />
                )}
                <Badge className="mb-1 text-xs">{court.sport_type}</Badge>
                <h3 className="font-semibold text-sm mb-1">{court.name}</h3>
                <p className="text-xs text-muted-foreground mb-2 flex items-center">
                  <MapPin className="h-3 w-3 mr-1" />
                  {court.city || court.location}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-primary">
                    {formatPrice(court.base_price)}/hr
                  </span>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="text-xs h-7"
                    onClick={() => navigate(`/courts/${court.slug}`)}
                  >
                    View
                  </Button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
