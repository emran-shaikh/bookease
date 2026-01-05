import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, X, Filter, Search } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export interface FilterState {
  status?: string;
  paymentStatus?: string;
  dateFrom?: Date;
  dateTo?: Date;
  courtId?: string;
  search?: string;
  role?: string;
}

interface DashboardFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  showStatusFilter?: boolean;
  showPaymentFilter?: boolean;
  showDateFilter?: boolean;
  showCourtFilter?: boolean;
  showSearchFilter?: boolean;
  showRoleFilter?: boolean;
  courts?: { id: string; name: string }[];
  statusOptions?: { value: string; label: string }[];
  paymentOptions?: { value: string; label: string }[];
  roleOptions?: { value: string; label: string }[];
  placeholder?: string;
}

const defaultStatusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
];

const defaultPaymentOptions = [
  { value: 'all', label: 'All Payments' },
  { value: 'pending', label: 'Pending' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

const defaultRoleOptions = [
  { value: 'all', label: 'All Roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'court_owner', label: 'Court Owner' },
  { value: 'customer', label: 'Customer' },
];

export function DashboardFilters({
  filters,
  onFilterChange,
  showStatusFilter = false,
  showPaymentFilter = false,
  showDateFilter = false,
  showCourtFilter = false,
  showSearchFilter = false,
  showRoleFilter = false,
  courts = [],
  statusOptions = defaultStatusOptions,
  paymentOptions = defaultPaymentOptions,
  roleOptions = defaultRoleOptions,
  placeholder = "Search...",
}: DashboardFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const activeFilterCount = [
    filters.status && filters.status !== 'all',
    filters.paymentStatus && filters.paymentStatus !== 'all',
    filters.dateFrom,
    filters.dateTo,
    filters.courtId && filters.courtId !== 'all',
    filters.search,
    filters.role && filters.role !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    onFilterChange({});
  };

  const clearDateRange = () => {
    onFilterChange({ ...filters, dateFrom: undefined, dateTo: undefined });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={isExpanded ? "secondary" : "outline"}
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="default" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {showSearchFilter && (
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={placeholder}
              value={filters.search || ''}
              onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
              className="pl-9"
            />
          </div>
        )}

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
            <X className="h-4 w-4" />
            Clear all
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="flex flex-wrap items-end gap-4 p-4 rounded-lg border bg-muted/30">
          {showStatusFilter && (
            <div className="space-y-2 min-w-[150px]">
              <Label className="text-xs font-medium">Booking Status</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value) => onFilterChange({ ...filters, status: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showPaymentFilter && (
            <div className="space-y-2 min-w-[150px]">
              <Label className="text-xs font-medium">Payment Status</Label>
              <Select
                value={filters.paymentStatus || 'all'}
                onValueChange={(value) => onFilterChange({ ...filters, paymentStatus: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showCourtFilter && courts.length > 0 && (
            <div className="space-y-2 min-w-[180px]">
              <Label className="text-xs font-medium">Court</Label>
              <Select
                value={filters.courtId || 'all'}
                onValueChange={(value) => onFilterChange({ ...filters, courtId: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Courts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courts</SelectItem>
                  {courts.map((court) => (
                    <SelectItem key={court.id} value={court.id}>
                      {court.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showRoleFilter && (
            <div className="space-y-2 min-w-[150px]">
              <Label className="text-xs font-medium">User Role</Label>
              <Select
                value={filters.role || 'all'}
                onValueChange={(value) => onFilterChange({ ...filters, role: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showDateFilter && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Date Range</Label>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 w-[130px] justify-start text-left font-normal",
                        !filters.dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateFrom ? format(filters.dateFrom, "MMM d, yyyy") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateFrom}
                      onSelect={(date) => onFilterChange({ ...filters, dateFrom: date })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground">to</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 w-[130px] justify-start text-left font-normal",
                        !filters.dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {filters.dateTo ? format(filters.dateTo, "MMM d, yyyy") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filters.dateTo}
                      onSelect={(date) => onFilterChange({ ...filters, dateTo: date })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {(filters.dateFrom || filters.dateTo) && (
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={clearDateRange}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick filter badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.status && filters.status !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Status: {filters.status}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => onFilterChange({ ...filters, status: undefined })} 
              />
            </Badge>
          )}
          {filters.paymentStatus && filters.paymentStatus !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Payment: {filters.paymentStatus}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => onFilterChange({ ...filters, paymentStatus: undefined })} 
              />
            </Badge>
          )}
          {filters.courtId && filters.courtId !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Court: {courts.find(c => c.id === filters.courtId)?.name || 'Selected'}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => onFilterChange({ ...filters, courtId: undefined })} 
              />
            </Badge>
          )}
          {filters.role && filters.role !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Role: {filters.role}
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => onFilterChange({ ...filters, role: undefined })} 
              />
            </Badge>
          )}
          {(filters.dateFrom || filters.dateTo) && (
            <Badge variant="secondary" className="gap-1">
              Date: {filters.dateFrom ? format(filters.dateFrom, "MMM d") : '...'} - {filters.dateTo ? format(filters.dateTo, "MMM d") : '...'}
              <X className="h-3 w-3 cursor-pointer" onClick={clearDateRange} />
            </Badge>
          )}
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Search: "{filters.search}"
              <X 
                className="h-3 w-3 cursor-pointer" 
                onClick={() => onFilterChange({ ...filters, search: undefined })} 
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
