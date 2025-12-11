import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to parse date from user message
function extractDateFromMessage(message: string): string | null {
  const today = new Date();
  const lowerMessage = message.toLowerCase();
  
  // Check for relative dates
  if (lowerMessage.includes('today')) {
    return today.toISOString().split('T')[0];
  }
  if (lowerMessage.includes('tomorrow')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  if (lowerMessage.includes('day after tomorrow')) {
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);
    return dayAfter.toISOString().split('T')[0];
  }
  
  // Check for day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lowerMessage.includes(days[i])) {
      const currentDay = today.getDay();
      let daysUntil = i - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return targetDate.toISOString().split('T')[0];
    }
  }
  
  // Check for date patterns like "15th", "on 15", "December 15"
  const datePattern = /(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)?/i;
  const match = lowerMessage.match(datePattern);
  if (match) {
    const day = parseInt(match[1]);
    if (day >= 1 && day <= 31) {
      const targetDate = new Date(today);
      targetDate.setDate(day);
      if (targetDate < today) {
        targetDate.setMonth(targetDate.getMonth() + 1);
      }
      return targetDate.toISOString().split('T')[0];
    }
  }
  
  return null;
}

// Helper to extract time preferences
function extractTimeFromMessage(message: string): { start: string; end: string } | null {
  const lowerMessage = message.toLowerCase();
  
  // Morning, afternoon, evening
  if (lowerMessage.includes('morning')) {
    return { start: '06:00', end: '12:00' };
  }
  if (lowerMessage.includes('afternoon')) {
    return { start: '12:00', end: '17:00' };
  }
  if (lowerMessage.includes('evening')) {
    return { start: '17:00', end: '22:00' };
  }
  
  // Specific times like "5pm", "5:00 pm", "17:00"
  const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
  const matches = [...lowerMessage.matchAll(timePattern)];
  
  if (matches.length >= 1) {
    let hour = parseInt(matches[0][1]);
    const minutes = matches[0][2] || '00';
    const period = matches[0][3]?.toLowerCase();
    
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    
    const startTime = `${hour.toString().padStart(2, '0')}:${minutes}`;
    const endHour = Math.min(hour + 2, 23); // Default 2 hour slot
    const endTime = `${endHour.toString().padStart(2, '0')}:${minutes}`;
    
    return { start: startTime, end: endTime };
  }
  
  return null;
}

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

    // Get the latest user message to check for availability queries
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    const requestedDate = extractDateFromMessage(lastUserMessage);
    const requestedTime = extractTimeFromMessage(lastUserMessage);

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

    // Fetch real-time bookings for requested date or next 7 days
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];

    const bookingsQuery = supabase
      .from("bookings")
      .select("court_id, booking_date, start_time, end_time, status")
      .in("status", ["confirmed", "pending"])
      .gte("booking_date", requestedDate || today)
      .lte("booking_date", requestedDate || nextWeekStr);

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      console.error("Error fetching bookings:", bookingsError);
    }

    // Fetch blocked slots
    const { data: blockedSlots, error: blockedError } = await supabase
      .from("blocked_slots")
      .select("court_id, date, start_time, end_time, reason")
      .gte("date", requestedDate || today)
      .lte("date", requestedDate || nextWeekStr);

    if (blockedError) {
      console.error("Error fetching blocked slots:", blockedError);
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
      `- ${court.name} (ID: ${court.id}, ${court.sport_type}) in ${court.city}, ${court.location}: Rs. ${court.base_price}/hour. ${court.amenities?.join(", ") || "No amenities listed"}. ${court.description || ""}`
    ).join("\n") || "No courts available";

    // Build real-time availability context
    let availabilityContext = "";
    if (requestedDate || requestedTime) {
      const dateStr = requestedDate || today;
      availabilityContext = `\n\nREAL-TIME AVAILABILITY FOR ${dateStr}:\n`;
      
      courts?.forEach(court => {
        const courtBookings = bookings?.filter(b => b.court_id === court.id && b.booking_date === dateStr) || [];
        const courtBlocked = blockedSlots?.filter(b => b.court_id === court.id && b.date === dateStr) || [];
        
        if (courtBookings.length === 0 && courtBlocked.length === 0) {
          availabilityContext += `- ${court.name}: Fully available all day\n`;
        } else {
          const bookedTimes = courtBookings.map(b => `${b.start_time}-${b.end_time} (${b.status})`);
          const blockedTimes = courtBlocked.map(b => `${b.start_time}-${b.end_time} (${b.reason || 'blocked'})`);
          availabilityContext += `- ${court.name}: Unavailable slots: ${[...bookedTimes, ...blockedTimes].join(", ") || "None"}\n`;
          
          // Suggest available slots
          const allSlots = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
          const unavailableStarts = [...courtBookings.map(b => b.start_time), ...courtBlocked.map(b => b.start_time)];
          const availableSlots = allSlots.filter(slot => !unavailableStarts.some(u => u <= slot && slot < u));
          
          if (availableSlots.length > 0) {
            availabilityContext += `  Available times: ${availableSlots.slice(0, 8).join(", ")}${availableSlots.length > 8 ? '...' : ''}\n`;
          }
        }
      });

      if (requestedTime) {
        availabilityContext += `\nUSER REQUESTED TIME: ${requestedTime.start} - ${requestedTime.end}\n`;
        const availableForTime = courts?.filter(court => {
          const courtBookings = bookings?.filter(b => 
            b.court_id === court.id && 
            b.booking_date === dateStr &&
            !(b.end_time <= requestedTime.start || b.start_time >= requestedTime.end)
          ) || [];
          const courtBlocked = blockedSlots?.filter(b => 
            b.court_id === court.id && 
            b.date === dateStr &&
            !(b.end_time <= requestedTime.start || b.start_time >= requestedTime.end)
          ) || [];
          return courtBookings.length === 0 && courtBlocked.length === 0;
        });
        
        if (availableForTime && availableForTime.length > 0) {
          availabilityContext += `Courts available for this time: ${availableForTime.map(c => c.name).join(", ")}\n`;
        } else {
          availabilityContext += `No courts available for this exact time. Suggest alternative times or courts.\n`;
        }
      }
    }

    const systemPrompt = `You are a helpful court booking assistant for BookedHours, a sports court booking platform. You help users find and book courts, answer questions about availability, pricing, and amenities.

AVAILABLE COURTS:
${courtsContext}
${availabilityContext}

PRICING INFORMATION:
- Base prices are per hour in Pakistani Rupees (Rs.)
- Peak hours may have higher rates (typically 1.25x-1.5x multiplier)
- Weekends may have higher rates
- Holidays have special pricing (typically 1.5x)
- Users can book 1-8 consecutive hours per reservation

BOOKING PROCESS:
1. Users browse courts on the Courts page or ask you for availability
2. Select a court to view details
3. Choose a date and available time slots
4. Select duration (1-8 hours)
5. Proceed to payment (card or bank transfer)
6. Receive confirmation email

KEY FEATURES:
- Real-time availability checking (you have access to current bookings!)
- Favorites system to save preferred courts
- Reviews and ratings from other users
- Distance-based sorting (nearest courts first)
- Filter by sport type, location, and price

IMPORTANT INSTRUCTIONS:
- When users ask about availability for a specific date/time, check the REAL-TIME AVAILABILITY section above
- If a slot is not available, suggest the closest available time slots
- If a court is fully booked, suggest alternative courts
- Always mention specific court names and times in your responses
- Be friendly, concise, and helpful
- Guide users through the booking process when needed`;

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
