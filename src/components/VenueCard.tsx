import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Building2 } from 'lucide-react';
import { formatCourtCount, getUniqueSportTypes, getLowestPrice } from '@/lib/venue-utils';
import { formatPrice } from '@/lib/currency';

interface VenueCardProps {
  venue: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    city: string;
    location: string;
    images?: string[];
    status: string;
    is_active: boolean;
  };
  courts?: any[];
  showManageButton?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function VenueCard({ venue, courts = [], showManageButton, onEdit, onDelete }: VenueCardProps) {
  const navigate = useNavigate();
  
  const sportTypes = getUniqueSportTypes(courts);
  const lowestPrice = getLowestPrice(courts);
  const courtCount = courts.length;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-lg group">
      <div className="aspect-video w-full overflow-hidden bg-muted relative">
        {venue.images && venue.images.length > 0 ? (
          <img
            src={venue.images[0]}
            alt={venue.name}
            className="h-full w-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-300"
            onClick={() => navigate(`/venues/${venue.slug}`)}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Building2 className="h-12 w-12" />
          </div>
        )}
        
        {/* Court count badge */}
        <div className="absolute top-2 left-2">
          <Badge variant="secondary" className="bg-background/90">
            {formatCourtCount(courtCount)}
          </Badge>
        </div>
        
        {/* Status badge for owner view */}
        {showManageButton && (
          <div className="absolute top-2 right-2">
            <Badge
              variant={
                venue.status === 'approved'
                  ? 'default'
                  : venue.status === 'pending'
                  ? 'secondary'
                  : 'destructive'
              }
            >
              {venue.status}
            </Badge>
          </div>
        )}
      </div>
      
      <CardHeader className="p-3 sm:p-4">
        <CardTitle className="line-clamp-1 text-base sm:text-lg">{venue.name}</CardTitle>
        <CardDescription className="line-clamp-2 text-xs sm:text-sm">
          {venue.description || 'Sports venue with multiple courts'}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-3 sm:p-4 pt-0">
        <div className="space-y-1.5 sm:space-y-2">
          {/* Sport types */}
          <div className="flex flex-wrap gap-1">
            {sportTypes.slice(0, 3).map((sport) => (
              <Badge key={sport} variant="outline" className="text-xs">
                {sport}
              </Badge>
            ))}
            {sportTypes.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{sportTypes.length - 3} more
              </Badge>
            )}
          </div>
          
          {/* Location */}
          <div className="flex items-center text-xs sm:text-sm text-muted-foreground">
            <MapPin className="mr-1 h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
            <span className="truncate">{venue.city}, {venue.location}</span>
          </div>
          
          {/* Starting price */}
          {lowestPrice > 0 && (
            <p className="text-base sm:text-lg font-bold">
              From {formatPrice(lowestPrice)}/hr
            </p>
          )}
        </div>
      </CardContent>
      
      <CardFooter className="p-3 sm:p-4 pt-0 gap-2">
        {showManageButton ? (
          <>
            <Button
              variant="outline"
              className="flex-1 h-9 sm:h-10 text-sm"
              onClick={onEdit}
            >
              Edit
            </Button>
            <Button
              variant="destructive"
              className="flex-1 h-9 sm:h-10 text-sm"
              onClick={onDelete}
            >
              Delete
            </Button>
          </>
        ) : (
          <Button
            className="w-full h-9 sm:h-10 text-sm"
            onClick={() => navigate(`/venues/${venue.slug}`)}
          >
            View Venue
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
