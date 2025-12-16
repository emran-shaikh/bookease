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
    // Overnight: hours until midnight + hours after midnight
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
  
  // Calculate hours (handles overnight)
  const hours = calculateHours(data.startTime, data.endTime);
  
  // Validate reasonable booking duration (max 12 hours)
  if (hours > 12) {
    throw new Error('Booking duration cannot exceed 12 hours');
  }
  if (hours <= 0) {
    throw new Error('Invalid booking duration');
  }
  
  // Validate date is not in the past
  const bookingDate = new Date(data.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (bookingDate < today) {
    throw new Error('Cannot book dates in the past');
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courtId, date, startTime, endTime } = await req.json();

    // Validate inputs
    validatePriceRequest({ courtId, date, startTime, endTime });

    // Use service role key for database queries
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

    let basePrice = parseFloat(court.base_price);

    // Calculate hours (handles overnight bookings)
    const hours = calculateHours(startTime, endTime);
    const overnight = isOvernightBooking(startTime, endTime);

    // Get day of week (0 = Sunday, 6 = Saturday)
    const bookingDate = new Date(date);
    const dayOfWeek = bookingDate.getDay();
    
    // For overnight, also get next day's day of week
    const nextDate = new Date(bookingDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDayOfWeek = nextDate.getDay();

    // Get active pricing rules for this court
    const { data: pricingRules, error: rulesError } = await supabaseAdmin
      .from('pricing_rules')
      .select('*')
      .eq('court_id', courtId)
      .eq('is_active', true);

    if (rulesError) throw rulesError;

    let priceMultiplier = 1.0;
    let appliedRules: string[] = [];

    // Apply pricing rules
    for (const rule of pricingRules || []) {
      if (rule.rule_type === 'peak_hours') {
        // Check if booking time falls within peak hours
        const ruleStart = rule.start_time;
        const ruleEnd = rule.end_time;
        
        if (ruleStart && ruleEnd) {
          // For overnight bookings, check both days
          const matchesDay1 = rule.days_of_week && rule.days_of_week.includes(dayOfWeek);
          const matchesDay2 = overnight && rule.days_of_week && rule.days_of_week.includes(nextDayOfWeek);
          
          if ((matchesDay1 || matchesDay2) && startTime >= ruleStart) {
            priceMultiplier = Math.max(priceMultiplier, parseFloat(rule.price_multiplier));
            appliedRules.push(`Peak Hours (${rule.price_multiplier}x)`);
          }
        }
      } else if (rule.rule_type === 'weekend') {
        // Check if it's weekend (Saturday=6, Sunday=0)
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const nextIsWeekend = overnight && (nextDayOfWeek === 0 || nextDayOfWeek === 6);
        
        if (isWeekend || nextIsWeekend) {
          priceMultiplier = Math.max(priceMultiplier, parseFloat(rule.price_multiplier));
          appliedRules.push(`Weekend (${rule.price_multiplier}x)`);
        }
      } else if (rule.rule_type === 'custom') {
        // Check custom day of week rules
        const matchesDay1 = rule.days_of_week && rule.days_of_week.includes(dayOfWeek);
        const matchesDay2 = overnight && rule.days_of_week && rule.days_of_week.includes(nextDayOfWeek);
        
        if (matchesDay1 || matchesDay2) {
          priceMultiplier = Math.max(priceMultiplier, parseFloat(rule.price_multiplier));
          appliedRules.push(`Custom (${rule.price_multiplier}x)`);
        }
      }
    }

    // Check for holidays (check both days for overnight)
    const { data: holiday } = await supabaseAdmin
      .from('holidays')
      .select('*')
      .eq('date', date)
      .eq('is_active', true)
      .maybeSingle();

    if (holiday) {
      priceMultiplier = Math.max(priceMultiplier, parseFloat(holiday.price_multiplier));
      appliedRules.push(`Holiday: ${holiday.name} (${holiday.price_multiplier}x)`);
    }

    // For overnight, also check next day's holidays
    if (overnight) {
      const nextDateStr = nextDate.toISOString().split('T')[0];
      const { data: nextHoliday } = await supabaseAdmin
        .from('holidays')
        .select('*')
        .eq('date', nextDateStr)
        .eq('is_active', true)
        .maybeSingle();

      if (nextHoliday && !holiday) {
        priceMultiplier = Math.max(priceMultiplier, parseFloat(nextHoliday.price_multiplier));
        appliedRules.push(`Holiday: ${nextHoliday.name} (${nextHoliday.price_multiplier}x)`);
      }
    }

    const finalPrice = basePrice * hours * priceMultiplier;

    console.log('Price calculation:', {
      courtId,
      date,
      startTime,
      endTime,
      overnight,
      basePrice,
      hours,
      priceMultiplier,
      appliedRules,
      finalPrice,
    });

    return new Response(
      JSON.stringify({
        basePrice,
        hours,
        priceMultiplier,
        totalPrice: finalPrice.toFixed(2),
        appliedRules,
        overnight,
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