import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Initialize Supabase client to fetch court data
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch available courts for context
    const { data: courts, error: courtsError } = await supabase
      .from("courts")
      .select("id, name, sport_type, location, city, base_price, amenities, description")
      .eq("status", "approved")
      .eq("is_active", true)
      .limit(20);

    if (courtsError) {
      console.error("Error fetching courts:", courtsError);
    }

    // Fetch pricing rules for context
    const { data: pricingRules, error: pricingError } = await supabase
      .from("pricing_rules")
      .select("court_id, rule_type, price_multiplier, start_time, end_time, days_of_week")
      .eq("is_active", true);

    if (pricingError) {
      console.error("Error fetching pricing rules:", pricingError);
    }

    // Build context about available courts
    const courtsContext = courts?.map(court => 
      `- ${court.name} (${court.sport_type}) in ${court.city}, ${court.location}: Rs. ${court.base_price}/hour. ${court.amenities?.join(", ") || "No amenities listed"}. ${court.description || ""}`
    ).join("\n") || "No courts available";

    const systemPrompt = `You are a helpful court booking assistant for a sports court booking platform. You help users find and book courts, answer questions about availability, pricing, and amenities.

AVAILABLE COURTS:
${courtsContext}

PRICING INFORMATION:
- Base prices are per hour in Pakistani Rupees (Rs.)
- Peak hours may have higher rates (typically 1.25x-1.5x multiplier)
- Weekends may have higher rates
- Holidays have special pricing (typically 1.5x)
- Users can book 1-8 consecutive hours per reservation

BOOKING PROCESS:
1. Users browse courts on the Courts page
2. Select a court to view details
3. Choose a date and available time slots
4. Select duration (1-8 hours)
5. Proceed to payment (Stripe card or bank transfer)
6. Receive confirmation email

KEY FEATURES:
- Real-time availability checking
- Favorites system to save preferred courts
- Reviews and ratings from other users
- Distance-based sorting (nearest courts first)
- Filter by sport type, location, and price

Be friendly, concise, and helpful. If asked about specific court availability, suggest they check the Courts page for real-time availability. Guide users through the booking process when needed.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Service temporarily unavailable. Please try again later." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Court assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
