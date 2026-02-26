import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SESSION_EXPIRY_MINUTES = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, message, media_url } = await req.json();

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: "phone and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get or create session
    const expiryThreshold = new Date(Date.now() - SESSION_EXPIRY_MINUTES * 60 * 1000).toISOString();

    // Clean expired sessions
    await supabase
      .from("whatsapp_sessions")
      .delete()
      .lt("last_message_at", expiryThreshold);

    // Get active session
    let { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("phone_number", phone)
      .gte("last_message_at", expiryThreshold)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      const { data: newSession } = await supabase
        .from("whatsapp_sessions")
        .insert({ phone_number: phone, conversation_state: { step: "initial", history: [] } })
        .select()
        .single();
      session = newSession;
    }

    // 2. Look up user by phone
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, city")
      .eq("phone", phone)
      .maybeSingle();

    if (userProfile && !session.user_id) {
      await supabase
        .from("whatsapp_sessions")
        .update({ user_id: userProfile.id })
        .eq("id", session.id);
    }

    // 3. Handle media (payment screenshot)
    if (media_url) {
      const state = session.conversation_state as any;
      if (state.pending_booking_id) {
        // Download and store the screenshot
        try {
          const mediaResponse = await fetch(media_url);
          const mediaBlob = await mediaResponse.blob();
          const fileName = `whatsapp/${phone}/${Date.now()}.jpg`;

          await supabase.storage
            .from("payment-screenshots")
            .upload(fileName, mediaBlob, { contentType: "image/jpeg" });

          const { data: urlData } = supabase.storage
            .from("payment-screenshots")
            .getPublicUrl(fileName);

          // Update booking with screenshot
          await supabase
            .from("bookings")
            .update({ payment_screenshot: urlData.publicUrl })
            .eq("id", state.pending_booking_id);

          await updateSession(supabase, session.id, {
            ...state,
            pending_booking_id: null,
          });

          return jsonResponse({
            reply: "Payment received! ✅\nThe court owner will confirm your booking shortly.\n\nYou can also track your booking at bookease.lovable.app",
          });
        } catch (e) {
          console.error("Error processing media:", e);
          return jsonResponse({ reply: "Sorry, I couldn't process your image. Please try sending it again." });
        }
      }
    }

    // 4. Fetch courts for context
    const { data: courts } = await supabase
      .from("courts")
      .select("id, name, sport_type, location, city, base_price, amenities, description, opening_time, closing_time, owner_id, venue_id")
      .eq("status", "approved")
      .eq("is_active", true)
      .limit(50);

    // 5. Fetch venue info for courts
    const venueIds = [...new Set((courts || []).filter(c => c.venue_id).map(c => c.venue_id))];
    let venues: any[] = [];
    if (venueIds.length > 0) {
      const { data: venueData } = await supabase
        .from("venues")
        .select("id, name, city, address")
        .in("id", venueIds);
      venues = venueData || [];
    }

    // 6. Build conversation history
    const state = session.conversation_state as any;
    const history = state.history || [];

    // Add current message to history
    history.push({ role: "user", content: message });

    // 7. Fetch real-time availability
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 14);
    const nextWeekStr = nextWeek.toISOString().split("T")[0];

    const { data: bookings } = await supabase
      .from("bookings")
      .select("court_id, booking_date, start_time, end_time, status")
      .in("status", ["confirmed", "pending"])
      .gte("booking_date", today)
      .lte("booking_date", nextWeekStr);

    const { data: blockedSlots } = await supabase
      .from("blocked_slots")
      .select("court_id, date, start_time, end_time, reason")
      .gte("date", today)
      .lte("date", nextWeekStr);

    // 8. Build system prompt
    const courtsContext = (courts || []).map((court) => {
      const venue = venues.find((v: any) => v.id === court.venue_id);
      return `- ${court.name} (ID: ${court.id}, ${court.sport_type}) at ${venue?.name || court.location || "N/A"}, ${court.city || "N/A"}. Rs. ${court.base_price}/hr. Hours: ${court.opening_time || "06:00"}-${court.closing_time || "22:00"}. Amenities: ${court.amenities?.join(", ") || "N/A"}`;
    }).join("\n");

    const bookingsContext = (bookings || []).map((b) =>
      `Court ${b.court_id}: ${b.booking_date} ${b.start_time}-${b.end_time} (${b.status})`
    ).join("\n");

    const blockedContext = (blockedSlots || []).map((b) =>
      `Court ${b.court_id}: ${b.date} ${b.start_time}-${b.end_time} (${b.reason || "blocked"})`
    ).join("\n");

    const userContext = userProfile
      ? `KNOWN USER: ${userProfile.full_name} (${userProfile.email}), Phone: ${phone}, City: ${userProfile.city || "N/A"}`
      : `UNKNOWN USER: Phone ${phone} — not registered. If they want to book, collect their full name and email.`;

    const sessionContext = state.step !== "initial"
      ? `\nCURRENT SESSION STATE: ${JSON.stringify({ step: state.step, selected_court: state.selected_court, selected_date: state.selected_date, selected_time: state.selected_time })}`
      : "";

    const systemPrompt = `You are BookEase WhatsApp Booking Assistant. Help users find and book sports courts via WhatsApp.

AVAILABLE COURTS:
${courtsContext || "No courts available"}

EXISTING BOOKINGS (unavailable slots):
${bookingsContext || "None"}

BLOCKED SLOTS:
${blockedContext || "None"}

${userContext}
${sessionContext}

TODAY'S DATE: ${today} (${new Date().toLocaleDateString("en-US", { weekday: "long" })})

YOUR CAPABILITIES:
1. Search courts by sport, city, date, time
2. Check real-time availability
3. Help book a court (create booking)
4. Show user's bookings
5. Cancel bookings
6. Accept payment screenshots

CONVERSATION RULES:
- Keep responses SHORT and WhatsApp-friendly (use emojis sparingly)
- When listing courts, number them (1️⃣, 2️⃣, 3️⃣) so users can reply with a number
- When a user wants to book, check availability first
- For unregistered users: ask for full name and email before booking
- After booking: show payment details (bank info from owner profile)
- Prices are in Pakistani Rupees (Rs.)
- Time format: use 12-hour (e.g., 10:00 PM)

TOOL CALLING:
You have access to tools. Use them to perform actions like booking courts, looking up details, etc.
When you need to perform an action, call the appropriate tool.`;

    // 9. Call AI with tool definitions
    const tools = [
      {
        type: "function",
        function: {
          name: "search_courts",
          description: "Search for available courts by sport type, city, date, and time",
          parameters: {
            type: "object",
            properties: {
              sport_type: { type: "string", description: "Sport type (e.g., badminton, tennis, cricket)" },
              city: { type: "string", description: "City name" },
              date: { type: "string", description: "Date in YYYY-MM-DD format" },
              start_time: { type: "string", description: "Start time in HH:MM format (24hr)" },
              end_time: { type: "string", description: "End time in HH:MM format (24hr)" },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "create_booking",
          description: "Create a booking for a court. Requires court_id, date, start_time, end_time. For new users also requires guest_name and guest_email.",
          parameters: {
            type: "object",
            properties: {
              court_id: { type: "string", description: "Court UUID" },
              date: { type: "string", description: "Booking date YYYY-MM-DD" },
              start_time: { type: "string", description: "Start time HH:MM (24hr)" },
              end_time: { type: "string", description: "End time HH:MM (24hr)" },
              guest_name: { type: "string", description: "Guest full name (for unregistered users)" },
              guest_email: { type: "string", description: "Guest email (for unregistered users)" },
            },
            required: ["court_id", "date", "start_time", "end_time"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_my_bookings",
          description: "Get the user's upcoming bookings",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "cancel_booking",
          description: "Cancel a booking by ID",
          parameters: {
            type: "object",
            properties: {
              booking_id: { type: "string", description: "Booking UUID to cancel" },
            },
            required: ["booking_id"],
          },
        },
      },
    ];

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-20), // Keep last 20 messages for context
    ];

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
        tools,
        stream: false,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errorText);
      return jsonResponse({
        reply: "Sorry, I'm having trouble right now. Please try again in a moment or visit bookease.lovable.app to book directly.",
      });
    }

    const aiData = await aiResponse.json();
    let assistantMessage = aiData.choices?.[0]?.message;

    // 10. Handle tool calls
    if (assistantMessage?.tool_calls) {
      const toolResults: any[] = [];

      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        let result: any;

        switch (toolCall.function.name) {
          case "search_courts": {
            result = await handleSearchCourts(supabase, args, courts || [], bookings || [], blockedSlots || [], venues);
            break;
          }
          case "create_booking": {
            result = await handleCreateBooking(supabase, args, phone, userProfile, courts || []);
            break;
          }
          case "get_my_bookings": {
            result = await handleGetBookings(supabase, phone, userProfile);
            break;
          }
          case "cancel_booking": {
            result = await handleCancelBooking(supabase, args.booking_id, userProfile);
            break;
          }
          default:
            result = { error: "Unknown tool" };
        }

        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Send tool results back to AI for final response
      const followUpResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            ...aiMessages,
            assistantMessage,
            ...toolResults,
          ],
          stream: false,
        }),
      });

      if (followUpResponse.ok) {
        const followUpData = await followUpResponse.json();
        assistantMessage = followUpData.choices?.[0]?.message;
      }
    }

    const reply = assistantMessage?.content || "Sorry, I couldn't understand that. Try asking about court availability or type 'help' for options.";

    // 11. Update session
    history.push({ role: "assistant", content: reply });
    await updateSession(supabase, session.id, {
      ...state,
      history: history.slice(-30), // Keep last 30 messages
    });

    return jsonResponse({ reply });
  } catch (error) {
    console.error("WhatsApp booking error:", error);
    return jsonResponse({
      reply: "Sorry, something went wrong. Please try again or visit bookease.lovable.app",
    });
  }
});

// Helper functions

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function updateSession(supabase: any, sessionId: string, state: any) {
  await supabase
    .from("whatsapp_sessions")
    .update({
      conversation_state: state,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
}

async function handleSearchCourts(
  supabase: any,
  args: any,
  courts: any[],
  bookings: any[],
  blockedSlots: any[],
  venues: any[]
) {
  let filtered = [...courts];

  if (args.sport_type) {
    filtered = filtered.filter((c) =>
      c.sport_type.toLowerCase().includes(args.sport_type.toLowerCase())
    );
  }
  if (args.city) {
    filtered = filtered.filter((c) =>
      c.city?.toLowerCase().includes(args.city.toLowerCase())
    );
  }

  // Check availability for date/time
  if (args.date && args.start_time && args.end_time) {
    filtered = filtered.filter((court) => {
      const courtBookings = bookings.filter(
        (b) =>
          b.court_id === court.id &&
          b.booking_date === args.date &&
          !(b.end_time <= args.start_time || b.start_time >= args.end_time)
      );
      const courtBlocked = blockedSlots.filter(
        (b) =>
          b.court_id === court.id &&
          b.date === args.date &&
          !(b.end_time <= args.start_time || b.start_time >= args.end_time)
      );
      return courtBookings.length === 0 && courtBlocked.length === 0;
    });
  }

  return {
    available_courts: filtered.map((c) => {
      const venue = venues.find((v: any) => v.id === c.venue_id);
      const hours = args.start_time && args.end_time
        ? (parseInt(args.end_time) - parseInt(args.start_time)) || 2
        : 1;
      return {
        id: c.id,
        name: c.name,
        sport_type: c.sport_type,
        venue: venue?.name || c.location,
        city: c.city,
        price_per_hour: c.base_price,
        total_price: c.base_price * hours,
        amenities: c.amenities,
      };
    }),
    date: args.date,
    time: args.start_time && args.end_time ? `${args.start_time}-${args.end_time}` : null,
  };
}

async function handleCreateBooking(
  supabase: any,
  args: any,
  phone: string,
  userProfile: any,
  courts: any[]
) {
  let userId = userProfile?.id;

  // Create profile for guest users
  if (!userId && args.guest_name && args.guest_email) {
    // Check if email already exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", args.guest_email)
      .maybeSingle();

    if (existingProfile) {
      userId = existingProfile.id;
      // Update phone if missing
      await supabase
        .from("profiles")
        .update({ phone })
        .eq("id", userId);
    } else {
      // Create auth user first, then profile is auto-created by trigger
      // For WhatsApp guests, we create a profile directly with service role
      const newId = crypto.randomUUID();
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: newId,
          email: args.guest_email,
          full_name: args.guest_name,
          phone: phone,
        });

      if (profileError) {
        console.error("Error creating guest profile:", profileError);
        return { error: "Could not create your profile. Please try signing up at bookease.lovable.app" };
      }

      // Assign customer role
      await supabase
        .from("user_roles")
        .insert({ user_id: newId, role: "customer" });

      userId = newId;
    }
  }

  if (!userId) {
    return {
      error: "need_details",
      message: "I need your full name and email to complete the booking.",
    };
  }

  // Calculate price
  const court = courts.find((c) => c.id === args.court_id);
  if (!court) return { error: "Court not found" };

  const startHour = parseInt(args.start_time.split(":")[0]);
  const endHour = parseInt(args.end_time.split(":")[0]);
  const hours = endHour > startHour ? endHour - startHour : (24 - startHour + endHour);
  const totalPrice = court.base_price * hours;

  // Check availability one more time
  const { data: existingBookings } = await supabase
    .from("bookings")
    .select("id")
    .eq("court_id", args.court_id)
    .eq("booking_date", args.date)
    .in("status", ["confirmed", "pending"])
    .or(`and(start_time.lt.${args.end_time},end_time.gt.${args.start_time})`);

  if (existingBookings && existingBookings.length > 0) {
    return { error: "This slot is no longer available. Please try a different time." };
  }

  // Create booking
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      court_id: args.court_id,
      user_id: userId,
      booking_date: args.date,
      start_time: args.start_time,
      end_time: args.end_time,
      total_price: totalPrice,
      status: "pending",
      payment_status: "pending",
      notes: `Booked via WhatsApp (${phone})`,
    })
    .select()
    .single();

  if (bookingError) {
    console.error("Booking error:", bookingError);
    return { error: "Failed to create booking. The slot may have been taken." };
  }

  // Get owner payment details
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("bank_name, account_title, account_number, whatsapp_number")
    .eq("id", court.owner_id)
    .maybeSingle();

  return {
    success: true,
    booking_id: booking.id,
    court_name: court.name,
    date: args.date,
    start_time: args.start_time,
    end_time: args.end_time,
    total_price: totalPrice,
    payment_details: ownerProfile ? {
      bank_name: ownerProfile.bank_name,
      account_title: ownerProfile.account_title,
      account_number: ownerProfile.account_number,
      owner_whatsapp: ownerProfile.whatsapp_number,
    } : null,
  };
}

async function handleGetBookings(supabase: any, phone: string, userProfile: any) {
  if (!userProfile) {
    return { error: "No bookings found for this number. Sign up at bookease.lovable.app to manage bookings." };
  }

  const today = new Date().toISOString().split("T")[0];
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, booking_date, start_time, end_time, total_price, status, payment_status, court_id")
    .eq("user_id", userProfile.id)
    .gte("booking_date", today)
    .order("booking_date", { ascending: true })
    .limit(10);

  if (!bookings || bookings.length === 0) {
    return { message: "No upcoming bookings found." };
  }

  // Get court names
  const courtIds = [...new Set(bookings.map((b: any) => b.court_id))];
  const { data: courts } = await supabase
    .from("courts")
    .select("id, name")
    .in("id", courtIds);

  return {
    bookings: bookings.map((b: any) => ({
      ...b,
      court_name: courts?.find((c: any) => c.id === b.court_id)?.name || "Unknown",
    })),
  };
}

async function handleCancelBooking(supabase: any, bookingId: string, userProfile: any) {
  if (!userProfile) {
    return { error: "Please sign up at bookease.lovable.app to manage bookings." };
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, user_id")
    .eq("id", bookingId)
    .eq("user_id", userProfile.id)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };
  if (booking.status === "cancelled") return { error: "This booking is already cancelled." };
  if (booking.status === "completed") return { error: "Cannot cancel a completed booking." };

  const { error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);

  if (error) return { error: "Failed to cancel booking." };
  return { success: true, message: "Booking cancelled successfully." };
}
