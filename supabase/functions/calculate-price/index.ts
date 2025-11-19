import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  
  // Validate that endTime is after startTime
  if (data.endTime <= data.startTime) {
    throw new Error('End time must be after start time');
  }
  
  // Validate date is not in the past
  const bookingDate = new Date(data.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (bookingDate < today) {
    throw new Error('Cannot book dates in the past');
  }
  
  // Validate reasonable booking duration (max 12 hours)
  const start = new Date(`2000-01-01T${data.startTime}`);
  const end = new Date(`2000-01-01T${data.endTime}`);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  if (hours > 12) {
    throw new Error('Booking duration cannot exceed 12 hours');
  }
  if (hours <= 0) {
    throw new Error('Invalid booking duration');
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

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

    // Calculate hours
    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    // Get day of week (0 = Sunday, 6 = Saturday)
    const dayOfWeek = new Date(date).getDay();

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
        
        if (ruleStart && ruleEnd && startTime >= ruleStart && endTime <= ruleEnd) {
          if (rule.days_of_week && rule.days_of_week.includes(dayOfWeek)) {
            priceMultiplier = Math.max(priceMultiplier, parseFloat(rule.price_multiplier));
            appliedRules.push(`Peak Hours (${rule.price_multiplier}x)`);
          }
        }
      } else if (rule.rule_type === 'weekend') {
        // Check if it's weekend (Saturday=6, Sunday=0)
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          priceMultiplier = Math.max(priceMultiplier, parseFloat(rule.price_multiplier));
          appliedRules.push(`Weekend (${rule.price_multiplier}x)`);
        }
      } else if (rule.rule_type === 'custom') {
        // Check custom day of week rules
        if (rule.days_of_week && rule.days_of_week.includes(dayOfWeek)) {
          priceMultiplier = Math.max(priceMultiplier, parseFloat(rule.price_multiplier));
          appliedRules.push(`Custom (${rule.price_multiplier}x)`);
        }
      }
    }

    // Check for holidays
    const { data: holiday, error: holidayError } = await supabaseAdmin
      .from('holidays')
      .select('*')
      .eq('date', date)
      .eq('is_active', true)
      .single();

    if (!holidayError && holiday) {
      priceMultiplier = Math.max(priceMultiplier, parseFloat(holiday.price_multiplier));
      appliedRules.push(`Holiday: ${holiday.name} (${holiday.price_multiplier}x)`);
    }

    const finalPrice = basePrice * hours * priceMultiplier;

    console.log('Price calculation:', {
      courtId,
      date,
      startTime,
      endTime,
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
