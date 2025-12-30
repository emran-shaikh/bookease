import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Check if booking is overnight (end time < start time means it wraps to next day)
const isOvernightBooking = (startTime: string, endTime: string): boolean => {
  return endTime < startTime || endTime === '00:00';
};

// Calculate hours considering overnight bookings
const calculateHours = (startTime: string, endTime: string): number => {
  const [startH] = startTime.split(':').map(Number);
  const [endH] = endTime.split(':').map(Number);
  
  if (isOvernightBooking(startTime, endTime)) {
    return (24 - startH) + endH;
  }
  
  return endH - startH;
};

// Input validation
const validatePriceRequest = (data: any) => {
  if (!data.courtId || typeof data.courtId !== 'string') {
    throw new Error('Invalid courtId');
  }
  if (!data.date || typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    throw new Error('Invalid date format (expected YYYY-MM-DD)');
  }
  if (!data.startTime || typeof data.startTime !== 'string' || !/^\d{2}:\d{2}$/.test(data.startTime)) {
    throw new Error('Invalid startTime format (expected HH:MM)');
  }
  if (!data.endTime || typeof data.endTime !== 'string' || !/^\d{2}:\d{2}$/.test(data.endTime)) {
    throw new Error('Invalid endTime format (expected HH:MM)');
  }
  
  const hours = calculateHours(data.startTime, data.endTime);
  
  if (hours > 12) {
    throw new Error('Booking duration cannot exceed 12 hours');
  }
  if (hours <= 0) {
    throw new Error('Invalid booking duration');
  }
  
  const bookingDate = new Date(data.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (bookingDate < today) {
    throw new Error('Cannot book dates in the past');
  }
};

// Get the date for a specific hour slot (handles overnight bookings)
const getDateForHourSlot = (baseDate: Date, startTime: string, hourIndex: number): { date: Date; dateStr: string; dayOfWeek: number } => {
  const startHour = parseInt(startTime.split(':')[0]);
  const slotHour = (startHour + hourIndex) % 24;
  
  // If the slot hour is less than start hour, it's the next day (overnight)
  const date = new Date(baseDate);
  if (slotHour < startHour) {
    date.setDate(date.getDate() + 1);
  }
  
  return {
    date,
    dateStr: date.toISOString().split('T')[0],
    dayOfWeek: date.getDay()
  };
};

// Check if a given hour falls within a time range (handles overnight ranges)
const isHourInTimeRange = (hour: number, startTime: string | null, endTime: string | null): boolean => {
  if (!startTime || !endTime) return true; // No time restriction
  
  const startHour = parseInt(startTime.split(':')[0]);
  const endHour = parseInt(endTime.split(':')[0]);
  
  // Handle overnight time ranges (e.g., 22:00 to 06:00)
  if (endHour <= startHour) {
    return hour >= startHour || hour < endHour;
  }
  
  // Normal time range
  return hour >= startHour && hour < endHour;
};

// Calculate price for a single hour slot
interface HourBreakdown {
  hour: number;
  startTime: string;
  endTime: string;
  date: string;
  basePrice: number;
  multiplier: number;
  hourPrice: number;
  rules: string[];
  isNextDay: boolean;
}

const calculateHourPrice = (
  hourIndex: number,
  startTime: string,
  baseDate: Date,
  basePrice: number,
  pricingRules: any[],
  holidays: Map<string, any>
): HourBreakdown => {
  const slotStartHour = parseInt(startTime.split(':')[0]) + hourIndex;
  const actualHour = slotStartHour % 24;
  const slotStart = `${actualHour.toString().padStart(2, '0')}:00`;
  const slotEnd = `${((actualHour + 1) % 24).toString().padStart(2, '0')}:00`;
  
  const { dateStr, dayOfWeek, date } = getDateForHourSlot(baseDate, startTime, hourIndex);
  const isNextDay = date.getTime() > baseDate.getTime();
  
  let priceMultiplier = 1.0;
  const appliedRules: string[] = [];

  // Priority order: special_date > holiday > peak_hours > weekend > custom
  let highestPriorityRule: { multiplier: number; priority: number; label: string } | null = null;

  for (const rule of pricingRules) {
    let matchesRule = false;
    let priority = 0;
    let label = '';

    if (rule.rule_type === 'special' && rule.specific_date) {
      // Special date pricing - highest priority for court-specific special dates
      if (rule.specific_date === dateStr) {
        const matchesTime = isHourInTimeRange(actualHour, rule.start_time, rule.end_time);
        if (matchesTime) {
          matchesRule = true;
          priority = 100; // Highest priority
          label = `Special Date (${rule.price_multiplier}x)`;
        }
      }
    } else if (rule.rule_type === 'peak_hours') {
      // Peak hours - check time range AND day of week
      const matchesDay = !rule.days_of_week || rule.days_of_week.length === 0 || rule.days_of_week.includes(dayOfWeek);
      const matchesTime = isHourInTimeRange(actualHour, rule.start_time, rule.end_time);
      
      if (matchesDay && matchesTime) {
        matchesRule = true;
        priority = 30;
        label = `Peak Hour (${rule.price_multiplier}x)`;
      }
    } else if (rule.rule_type === 'weekend') {
      // Weekend pricing - check if weekend AND optional time range
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const matchesTime = isHourInTimeRange(actualHour, rule.start_time, rule.end_time);
      
      if (isWeekend && matchesTime) {
        matchesRule = true;
        priority = 20;
        label = `Weekend (${rule.price_multiplier}x)`;
      }
    } else if (rule.rule_type === 'custom') {
      // Custom rules - check day of week AND optional time range
      const matchesDay = rule.days_of_week && rule.days_of_week.includes(dayOfWeek);
      const matchesTime = isHourInTimeRange(actualHour, rule.start_time, rule.end_time);
      
      if (matchesDay && matchesTime) {
        matchesRule = true;
        priority = 10;
        label = `Custom (${rule.price_multiplier}x)`;
      }
    }

    if (matchesRule) {
      const ruleMultiplier = Number(rule.price_multiplier);
      // Use higher priority rule, or higher multiplier if same priority
      if (!highestPriorityRule || 
          priority > highestPriorityRule.priority || 
          (priority === highestPriorityRule.priority && ruleMultiplier > highestPriorityRule.multiplier)) {
        highestPriorityRule = { multiplier: ruleMultiplier, priority, label };
      }
    }
  }

  // Apply the highest priority rule if found
  if (highestPriorityRule) {
    priceMultiplier = highestPriorityRule.multiplier;
    appliedRules.push(highestPriorityRule.label);
  }

  // Check for global holidays (from holidays table) - priority 50, between special date and peak hours
  const holiday = holidays.get(dateStr);
  if (holiday) {
    const holidayMultiplier = Number(holiday.price_multiplier);
    // Holiday from global table has priority 50
    if (!highestPriorityRule || highestPriorityRule.priority < 50) {
      if (holidayMultiplier > priceMultiplier) {
        priceMultiplier = holidayMultiplier;
        appliedRules.length = 0;
        appliedRules.push(`Holiday: ${holiday.name} (${holiday.price_multiplier}x)`);
      }
    }
  }

  return {
    hour: hourIndex + 1,
    startTime: slotStart,
    endTime: slotEnd,
    date: dateStr,
    basePrice,
    multiplier: priceMultiplier,
    hourPrice: basePrice * priceMultiplier,
    rules: appliedRules.length > 0 ? appliedRules : ['Standard Rate'],
    isNextDay
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courtId, date, startTime, endTime } = await req.json();

    validatePriceRequest({ courtId, date, startTime, endTime });

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get court base price
    const { data: court, error: courtError } = await supabaseAdmin
      .from('courts')
      .select('base_price')
      .eq('id', courtId)
      .single();

    if (courtError) throw courtError;

    const basePrice = parseFloat(court.base_price);
    const totalHours = calculateHours(startTime, endTime);
    const overnight = isOvernightBooking(startTime, endTime);
    const bookingDate = new Date(date);

    // Get pricing rules for this court
    const { data: pricingRules, error: rulesError } = await supabaseAdmin
      .from('pricing_rules')
      .select('*')
      .eq('court_id', courtId)
      .eq('is_active', true);

    if (rulesError) throw rulesError;

    // Get holidays for booking date and next day (for overnight bookings)
    const nextDate = new Date(bookingDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    const { data: holidayData, error: holidayError } = await supabaseAdmin
      .from('holidays')
      .select('*')
      .in('date', [date, nextDateStr])
      .eq('is_active', true);

    if (holidayError) throw holidayError;

    // Create holidays map for quick lookup
    const holidays = new Map<string, any>();
    holidayData?.forEach(h => holidays.set(h.date, h));

    // Calculate price for each hour separately
    const hourlyBreakdown: HourBreakdown[] = [];
    let totalPrice = 0;

    for (let i = 0; i < totalHours; i++) {
      const hourBreakdown = calculateHourPrice(
        i,
        startTime,
        bookingDate,
        basePrice,
        pricingRules || [],
        holidays
      );
      hourlyBreakdown.push(hourBreakdown);
      totalPrice += hourBreakdown.hourPrice;
    }

    // Calculate summary statistics
    const normalHours = hourlyBreakdown.filter(h => h.multiplier === 1);
    const peakHours = hourlyBreakdown.filter(h => h.multiplier > 1);
    const normalTotal = normalHours.reduce((sum, h) => sum + h.hourPrice, 0);
    const peakTotal = peakHours.reduce((sum, h) => sum + h.hourPrice, 0);

    // Get unique applied rules
    const allRules = new Set<string>();
    hourlyBreakdown.forEach(h => h.rules.forEach(r => allRules.add(r)));

    console.log('Price calculation (per-hour):', {
      courtId,
      date,
      startTime,
      endTime,
      overnight,
      basePrice,
      totalHours,
      hourlyBreakdown: hourlyBreakdown.map(h => ({
        hour: h.hour,
        time: `${h.startTime}-${h.endTime}`,
        multiplier: h.multiplier,
        price: h.hourPrice,
        rules: h.rules
      })),
      totalPrice,
    });

    return new Response(
      JSON.stringify({
        basePrice,
        hours: totalHours,
        totalPrice: totalPrice.toFixed(2),
        overnight,
        // Detailed hourly breakdown
        hourlyBreakdown,
        // Summary for quick display
        summary: {
          normalHours: normalHours.length,
          normalTotal,
          peakHours: peakHours.length,
          peakTotal,
          appliedRules: Array.from(allRules)
        },
        // Legacy fields for backward compatibility
        priceMultiplier: totalHours > 0 ? totalPrice / (basePrice * totalHours) : 1,
        appliedRules: Array.from(allRules)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error calculating price:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});