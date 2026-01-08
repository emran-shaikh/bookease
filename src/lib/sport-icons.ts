// Sport type icons and display utilities (Janbaz-style)

export const sportIcons: Record<string, string> = {
  'Cricket': '🏏',
  'Futsal': '⚽',
  'Football': '⚽',
  'Soccer': '⚽',
  'Padel': '🎾',
  'Tennis': '🎾',
  'Badminton': '🏸',
  'Basketball': '🏀',
  'Volleyball': '🏐',
  'Squash': '🎾',
  'Table Tennis': '🏓',
  'Pickleball': '🏓',
  'Hockey': '🏑',
  'Swimming': '🏊',
  'Gym': '🏋️',
  'Yoga': '🧘',
  'Boxing': '🥊',
  'Wrestling': '🤼',
  'Martial Arts': '🥋',
  'Golf': '⛳',
  'Bowling': '🎳',
};

export const amenityIcons: Record<string, string> = {
  'Parking': '🅿️',
  'WiFi': '📶',
  'Cafe': '☕',
  'Cafeteria': '☕',
  'Restaurant': '🍽️',
  'Toilets': '🚻',
  'Restrooms': '🚻',
  'Changing Rooms': '🚿',
  'Showers': '🚿',
  'Locker Rooms': '🔐',
  'First Aid': '🏥',
  'Equipment Rental': '🏏',
  'Floodlights': '💡',
  'Lighting': '💡',
  'AC': '❄️',
  'Air Conditioning': '❄️',
  'Seating': '💺',
  'Spectator Area': '👥',
  'Pro Shop': '🛒',
  'Water': '💧',
  'Drinking Water': '💧',
  'Security': '🛡️',
  'CCTV': '📹',
  'Wheelchair Access': '♿',
  'Kids Area': '👶',
  'Coaching': '📋',
};

export function getSportIcon(sportType: string): string {
  return sportIcons[sportType] || '🎯';
}

export function getAmenityIcon(amenity: string): string {
  // Check for exact match first
  if (amenityIcons[amenity]) return amenityIcons[amenity];
  
  // Check for partial match
  const lowerAmenity = amenity.toLowerCase();
  for (const [key, icon] of Object.entries(amenityIcons)) {
    if (lowerAmenity.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerAmenity)) {
      return icon;
    }
  }
  
  return '✓';
}

export function formatSportWithIcon(sportType: string): string {
  return `${getSportIcon(sportType)} ${sportType}`;
}

export function formatAmenityWithIcon(amenity: string): string {
  return `${getAmenityIcon(amenity)} ${amenity}`;
}
