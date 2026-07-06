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
    const webhookSecret = Deno.env.get("BOOKING_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("x-booking-webhook-secret");

    if (!webhookSecret || providedSecret !== webhookSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json();
    const {
      event,
      booking_id,
      court_id,
      user_id,
      previous_status,
    } = payload;

    if (!booking_id || !/^[0-9a-fA-F-]{36}$/.test(String(booking_id))) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid booking_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, court_id, user_id, booking_date, start_time, end_time, total_price, status, payment_status, payment_screenshot, notes")
      .eq("id", booking_id)
      .maybeSingle();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ success: false, error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if ((court_id && court_id !== booking.court_id) || (user_id && user_id !== booking.user_id)) {
      return new Response(
        JSON.stringify({ success: false, error: "Booking payload mismatch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enrich with court details
    const { data: court } = await supabase
      .from("courts")
      .select("name, sport_type, city, location, owner_id, venue_id")
      .eq("id", booking.court_id)
      .maybeSingle();

    // Get venue info
    let venueName = null;
    if (court?.venue_id) {
      const { data: venue } = await supabase
        .from("venues")
        .select("name")
        .eq("id", court.venue_id)
        .maybeSingle();
      venueName = venue?.name;
    }

    // Get customer info
    const { data: customer } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", booking.user_id)
      .maybeSingle();

    // Get owner payment/webhook info
    const { data: owner } = await supabase
      .from("owner_payment_settings")
      .select("whatsapp_number, n8n_webhook_url, bank_name, account_title, account_number")
      .eq("owner_id", court?.owner_id)
      .maybeSingle();

    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", court?.owner_id)
      .maybeSingle();

    // Build enriched payload
    const enrichedPayload = {
      event: event || (previous_status ? "booking.status_changed" : "booking.created"),
      booking_id: booking.id,
      court_name: court?.name || "Unknown Court",
      sport_type: court?.sport_type,
      venue_name: venueName || court?.location,
      city: court?.city,
      customer_name: customer?.full_name || "Unknown",
      customer_phone: customer?.phone || "",
      customer_email: customer?.email || "",
      booking_date: booking.booking_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
      total_price: booking.total_price,
      status: booking.status,
      previous_status: previous_status || null,
      payment_status: booking.payment_status,
      payment_screenshot: booking.payment_screenshot || null,
      owner_name: ownerProfile?.full_name,
      owner_whatsapp: owner?.whatsapp_number,
      owner_bank: owner?.bank_name ? {
        bank_name: owner.bank_name,
        account_title: owner.account_title,
        account_number: owner.account_number,
      } : null,
      notes: booking.notes || null,
      timestamp: new Date().toISOString(),
    };

    // Determine webhook URL: owner-specific or global
    const webhookUrl =
      owner?.n8n_webhook_url ||
      Deno.env.get("N8N_BOOKING_WEBHOOK_URL");

    if (!webhookUrl) {
      console.log("No webhook URL configured, skipping notification");
      return new Response(
        JSON.stringify({ success: true, message: "No webhook URL configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send to n8n webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enrichedPayload),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error("Webhook delivery failed:", webhookResponse.status, errorText);
      // Don't throw — webhook failure should not block the booking flow
      return new Response(
        JSON.stringify({ success: false, error: "Webhook delivery failed", status: webhookResponse.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await webhookResponse.text(); // consume body

    return new Response(
      JSON.stringify({ success: true, message: "Webhook delivered" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Booking webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
