import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { formatPrice } from "@/lib/currency";
import { formatCourtCount, getUniqueSportTypes, getLowestPrice } from "@/lib/venue-utils";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import "leaflet.markercluster";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

interface Court {
  id: string;
  slug: string;
  name: string;
  location: string;
  city: string;
  base_price: number;
  sport_type: string;
  images: string[] | null;
  court_specific_images?: string[] | null;
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

// Fix default marker icons for bundlers (Vite)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const venueIcon = new L.DivIcon({
  className: "custom-venue-marker",
  html: `<div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg border-2 border-background">
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
    <path d="M9 22v-4h6v4"/>
    <path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/>
    <path d="M12 10h.01"/><path d="M12 14h.01"/>
    <path d="M16 10h.01"/><path d="M16 14h.01"/>
    <path d="M8 10h.01"/><path d="M8 14h.01"/>
  </svg>
</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

const courtIcon = new L.DivIcon({
  className: "custom-court-marker",
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

const userLocationIcon = new L.DivIcon({
  className: "custom-user-marker",
  html: `<div class="flex items-center justify-center w-6 h-6 rounded-full bg-accent text-accent-foreground shadow-lg border-2 border-background animate-pulse">
  <div class="w-2 h-2 rounded-full bg-background"></div>
</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function buildVenuePopup(venue: Venue): string {
  const sports = getUniqueSportTypes(venue.courts).slice(0, 2);
  const imgHtml = venue.images?.[0]
    ? `<img src="${venue.images[0]}" alt="${venue.name}" style="width:calc(100% + 24px);height:96px;object-fit:cover;border-radius:6px 6px 0 0;margin:-12px -12px 8px" loading="lazy"/>`
    : "";
  return `<div style="min-width:200px;max-width:280px">
    ${imgHtml}
    <div style="display:flex;gap:6px;margin-bottom:4px">
      <span style="background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-size:11px;padding:2px 6px;border-radius:4px;display:inline-flex;align-items:center;gap:4px">🏢 Venue</span>
      <span style="font-size:11px;padding:2px 6px;border-radius:4px;border:1px solid #ddd">${formatCourtCount(venue.courts.length)}</span>
    </div>
    <h3 style="font-weight:600;font-size:14px;margin:0 0 4px">${venue.name}</h3>
    <p style="font-size:12px;color:#666;margin:0 0 6px">📍 ${venue.city}</p>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">
      ${sports.map((s) => `<span style="font-size:11px;padding:2px 6px;border-radius:4px;background:#f3f4f6">${s}</span>`).join("")}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px;font-weight:600;color:hsl(var(--primary))">From ${formatPrice(getLowestPrice(venue.courts))}/hr</span>
      <a href="/venues/${venue.slug}" style="font-size:12px;padding:2px 10px;border:1px solid #ddd;border-radius:4px;text-decoration:none;color:inherit">View</a>
    </div>
  </div>`;
}

function buildCourtPopup(court: Court): string {
  const courtImage = court.court_specific_images?.[0] || court.images?.[0];
  const imgHtml = courtImage
    ? `<img src="${courtImage}" alt="${court.name}" style="width:calc(100% + 24px);height:80px;object-fit:cover;border-radius:6px 6px 0 0;margin:-12px -12px 8px" loading="lazy"/>`
    : "";
  return `<div style="min-width:180px;max-width:250px">
    ${imgHtml}
    <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));display:inline-block;margin-bottom:4px">${court.sport_type}</span>
    <h3 style="font-weight:600;font-size:14px;margin:0 0 4px">${court.name}</h3>
    <p style="font-size:12px;color:#666;margin:0 0 6px">📍 ${court.city || court.location}</p>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px;font-weight:600;color:hsl(var(--primary))">${formatPrice(court.base_price)}/hr</span>
      <a href="/courts/${court.slug}" style="font-size:12px;padding:2px 10px;border:1px solid #ddd;border-radius:4px;text-decoration:none;color:inherit">View</a>
    </div>
  </div>`;
}

function buildClusterPopup(markers: L.Marker[]): string {
  let venueCount = 0;
  let courtCount = 0;
  const names: string[] = [];

  markers.forEach((m) => {
    const opts = (m as any).options;
    if (opts._type === "venue") {
      venueCount++;
    } else {
      courtCount++;
    }
    if (names.length < 5) names.push(opts._name || "Unknown");
  });

  const parts: string[] = [];
  if (venueCount > 0) parts.push(`${venueCount} venue${venueCount > 1 ? "s" : ""}`);
  if (courtCount > 0) parts.push(`${courtCount} court${courtCount > 1 ? "s" : ""}`);

  return `<div style="min-width:160px;max-width:240px">
    <h3 style="font-weight:600;font-size:14px;margin:0 0 6px">${markers.length} locations</h3>
    <p style="font-size:12px;color:#666;margin:0 0 6px">${parts.join(", ")}</p>
    <ul style="margin:0;padding:0 0 0 16px;font-size:12px">
      ${names.map((n) => `<li>${n}</li>`).join("")}
      ${markers.length > 5 ? `<li style="color:#999">+${markers.length - 5} more…</li>` : ""}
    </ul>
    <p style="font-size:11px;color:#999;margin:6px 0 0">Click to zoom in</p>
  </div>`;
}

function ClusteredMarkers({
  venues,
  courts,
}: {
  venues: Venue[];
  courts: Court[];
}) {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (c) => {
        const count = c.getChildCount();
        let size = "small";
        let dim = 40;
        if (count >= 100) { size = "large"; dim = 56; }
        else if (count >= 10) { size = "medium"; dim = 48; }

        return new L.DivIcon({
          html: `<div class="cluster-marker cluster-${size}"><span>${count}</span></div>`,
          className: "custom-cluster-icon",
          iconSize: [dim, dim],
        });
      },
    });

    // Add cluster popup on hover
    cluster.on("clustermouseover", (e: any) => {
      const childMarkers = e.layer.getAllChildMarkers();
      const popup = L.popup()
        .setLatLng(e.layer.getLatLng())
        .setContent(buildClusterPopup(childMarkers));
      popup.openOn(map);
    });
    cluster.on("clustermouseout", () => {
      map.closePopup();
    });

    venues.forEach((venue) => {
      if (venue.latitude == null || venue.longitude == null) return;
      const marker = L.marker([venue.latitude, venue.longitude], {
        icon: venueIcon,
        _type: "venue",
        _name: venue.name,
      } as any);
      marker.bindPopup(buildVenuePopup(venue));
      cluster.addLayer(marker);
    });

    courts.forEach((court) => {
      if (court.latitude == null || court.longitude == null) return;
      const marker = L.marker([court.latitude, court.longitude], {
        icon: courtIcon,
        _type: "court",
        _name: court.name,
      } as any);
      marker.bindPopup(buildCourtPopup(court));
      cluster.addLayer(marker);
    });

    map.addLayer(cluster);
    clusterRef.current = cluster;

    return () => {
      map.removeLayer(cluster);
      clusterRef.current = null;
    };
  }, [map, venues, courts]);

  return null;
}

function FitBounds({
  points,
  maxZoom = 14,
}: {
  points: [number, number][];
  maxZoom?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom });
  }, [map, points, maxZoom]);

  return null;
}

export default function MapView({ venues, courts, userLocation, className = "" }: MapViewProps) {
  const venuesWithCoords = useMemo(
    () => venues.filter((v) => v.latitude != null && v.longitude != null),
    [venues]
  );
  const courtsWithCoords = useMemo(
    () => courts.filter((c) => c.latitude != null && c.longitude != null),
    [courts]
  );

  const points = useMemo(() => {
    const pts: [number, number][] = [];
    venuesWithCoords.forEach((v) => pts.push([v.latitude!, v.longitude!]));
    courtsWithCoords.forEach((c) => pts.push([c.latitude!, c.longitude!]));
    if (userLocation) pts.push([userLocation.lat, userLocation.lng]);
    return pts;
  }, [venuesWithCoords, courtsWithCoords, userLocation]);

  const defaultCenter: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [24.8607, 67.0011];

  const hasAnyMarkers = venuesWithCoords.length > 0 || courtsWithCoords.length > 0;

  if (!hasAnyMarkers && !userLocation) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded-xl ${className}`}>
        <div className="text-center p-8">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No locations available</h3>
          <p className="text-sm text-muted-foreground">
            Venues and courts without coordinates won&apos;t appear on the map.
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
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds points={points} />

        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon}>
            <Popup>
              <div className="text-center">
                <strong>Your Location</strong>
              </div>
            </Popup>
          </Marker>
        )}

        <ClusteredMarkers venues={venuesWithCoords} courts={courtsWithCoords} />
      </MapContainer>
    </div>
  );
}
