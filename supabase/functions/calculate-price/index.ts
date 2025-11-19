import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courtId, date, startTime, endTime } = await req.json();

    if (!courtId || !date || !startTime || !endTime) {
      throw new Error('Missing required parameters');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get court base price
    const { data: court, error: courtError } = await supabase
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
    const { data: pricingRules, error: rulesError } = await supabase
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
    const { data: holiday, error: holidayError } = await supabase
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
