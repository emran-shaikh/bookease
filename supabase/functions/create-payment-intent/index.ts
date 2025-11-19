import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2023-10-16",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation
const validatePaymentRequest = (data: any) => {
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
  if (!data.courtName || typeof data.courtName !== 'string' || data.courtName.length > 255) {
    throw new Error('Invalid courtName');
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
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { courtId, courtName, date, startTime, endTime } = await req.json();
    
    // Validate inputs
    validatePaymentRequest({ courtId, courtName, date, startTime, endTime });

    console.log("Creating payment intent for:", { courtId, courtName, date, startTime, endTime, userId: user.id });

    // Calculate price server-side to prevent manipulation
    const { data: priceData, error: priceError } = await supabaseClient.functions.invoke(
      'calculate-price',
      {
        body: { courtId, date, startTime, endTime }
      }
    );

    if (priceError) {
      console.error("Error calculating price:", priceError);
      throw new Error("Failed to calculate price");
    }

    const calculatedPrice = parseFloat(priceData.totalPrice);
    
    if (isNaN(calculatedPrice) || calculatedPrice <= 0) {
      throw new Error("Invalid calculated price");
    }

    console.log("Calculated price:", calculatedPrice);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(calculatedPrice * 100), // Convert to cents using server-calculated price
      currency: "usd",
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        user_id: user.id,
        court_id: courtId,
        court_name: courtName.substring(0, 255), // Sanitize length
        booking_date: date,
        start_time: startTime,
        end_time: endTime,
      },
    });

    console.log("Payment intent created:", paymentIntent.id);

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error creating payment intent:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
