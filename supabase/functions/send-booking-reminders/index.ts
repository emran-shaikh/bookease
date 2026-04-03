import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.83.0";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const PAYMENT_HOLD_MINUTES = 30;
const REMINDER_BEFORE_EXPIRY_MINUTES = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

const sendDailyConfirmedBookingReminders = async (supabase: ReturnType<typeof createClient>) => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDateStr = tomorrow.toISOString().split("T")[0];

  console.log(`Checking for bookings on ${tomorrowDateStr}`);

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select(`
      id,
      booking_date,
      start_time,
      end_time,
      total_price,
      user_id,
      court_id
    `)
    .eq("booking_date", tomorrowDateStr)
    .eq("status", "confirmed");

  if (bookingsError) {
    console.error("Error fetching bookings:", bookingsError);
    throw bookingsError;
  }

  if (!bookings || bookings.length === 0) {
    return { emailsSent: 0, notificationsCreated: 0, bookingsChecked: 0 };
  }

  let emailsSent = 0;
  let notificationsCreated = 0;

  for (const booking of bookings) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name, phone")
      .eq("id", booking.user_id)
      .single();

    if (profileError || !profile) continue;

    const { data: court, error: courtError } = await supabase
      .from("courts")
      .select("name, address, city")
      .eq("id", booking.court_id)
      .single();

    if (courtError || !court) continue;

    const bookingDate = new Date(booking.booking_date).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const startTime = formatTime(booking.start_time);
    const endTime = formatTime(booking.end_time);

    try {
      await resend.emails.send({
        from: "BookedHours <support@bookedhours.com>",
        to: [profile.email],
        subject: "Reminder: Your Court Booking is Tomorrow! ⏰",
        html: `
          <!DOCTYPE html>
          <html><body style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
            <h2>⏰ Booking Reminder</h2>
            <p>Hi ${profile.full_name || "there"}, your booking is tomorrow.</p>
            <p><strong>Court:</strong> ${court.name}</p>
            <p><strong>Location:</strong> ${court.address}, ${court.city}</p>
            <p><strong>Date:</strong> ${bookingDate}</p>
            <p><strong>Time:</strong> ${startTime} - ${endTime}</p>
          </body></html>
        `,
      });
      emailsSent++;
    } catch (emailError) {
      console.error(`Error sending daily reminder to ${profile.email}:`, emailError);
    }

    const { error: notifError } = await supabase.from("notifications").insert({
      user_id: booking.user_id,
      title: "Booking Reminder ⏰",
      message: `Your booking at ${court.name} is tomorrow at ${startTime}.`,
      type: "info",
      related_court_id: booking.court_id,
    });

    if (!notifError) notificationsCreated++;
  }

  return { emailsSent, notificationsCreated, bookingsChecked: bookings.length };
};

const sendPendingPaymentReminders = async (supabase: ReturnType<typeof createClient>) => {
  const now = new Date();
  const reminderAgeMinutes = PAYMENT_HOLD_MINUTES - REMINDER_BEFORE_EXPIRY_MINUTES; // 20 minutes
  const windowStart = new Date(now.getTime() - (reminderAgeMinutes + 1) * 60 * 1000);
  const windowEnd = new Date(now.getTime() - reminderAgeMinutes * 60 * 1000);

  const { data: pendingBookings, error: pendingBookingsError } = await supabase
    .from("bookings")
    .select(`
      id,
      booking_date,
      start_time,
      end_time,
      total_price,
      user_id,
      court_id,
      created_at,
      courts(name, owner_id),
      profiles(full_name, email)
    `)
    .eq("status", "pending")
    .eq("payment_status", "pending")
    .gte("created_at", windowStart.toISOString())
    .lt("created_at", windowEnd.toISOString());

  if (pendingBookingsError) {
    console.error("Error fetching pending bookings:", pendingBookingsError);
    throw pendingBookingsError;
  }

  if (!pendingBookings || pendingBookings.length === 0) {
    return { userEmailsSent: 0, ownerEmailsSent: 0, bookingsChecked: 0 };
  }

  const ownerIds = [...new Set(
    pendingBookings
      .map((booking: any) => booking.courts?.owner_id)
      .filter(Boolean),
  )];

  const { data: ownerProfiles } = ownerIds.length > 0
    ? await supabase.from("profiles").select("id, email, full_name").in("id", ownerIds)
    : { data: [] as Array<{ id: string; email: string; full_name: string | null }> };

  const ownerMap = new Map((ownerProfiles || []).map((owner) => [owner.id, owner]));

  let userEmailsSent = 0;
  let ownerEmailsSent = 0;

  for (const booking of pendingBookings as any[]) {
    const courtName = booking.courts?.name || "your court";
    const userEmail = booking.profiles?.email;
    const userName = booking.profiles?.full_name || "Customer";

    const owner = ownerMap.get(booking.courts?.owner_id || "");
    const ownerEmail = owner?.email;
    const ownerName = owner?.full_name || "Court Owner";

    if (userEmail) {
      try {
        await resend.emails.send({
          from: "BookedHours <support@bookedhours.com>",
          to: [userEmail],
          subject: "⏳ Reminder: Confirm your booking payment",
          html: `
            <!DOCTYPE html>
            <html><body style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
              <h2>⏳ Payment Reminder</h2>
              <p>Hi ${userName}, your booking for <strong>${courtName}</strong> is still pending payment confirmation.</p>
              <p>Please share/confirm your payment now. This booking expires in about ${REMINDER_BEFORE_EXPIRY_MINUTES} minutes.</p>
            </body></html>
          `,
        });
        userEmailsSent++;
      } catch (emailError) {
        console.error(`Error sending payment reminder to user ${userEmail}:`, emailError);
      }
    }

    if (ownerEmail) {
      try {
        await resend.emails.send({
          from: "BookedHours <support@bookedhours.com>",
          to: [ownerEmail],
          subject: "⏳ Reminder: Pending booking payment needs confirmation",
          html: `
            <!DOCTYPE html>
            <html><body style="font-family: Arial, sans-serif; line-height:1.6; color:#333;">
              <h2>⏳ Pending Payment Reminder</h2>
              <p>Hi ${ownerName}, booking payment for <strong>${courtName}</strong> is still pending.</p>
              <p>Please check for payment proof and confirm the booking soon. It is close to expiry.</p>
            </body></html>
          `,
        });
        ownerEmailsSent++;
      } catch (emailError) {
        console.error(`Error sending payment reminder to owner ${ownerEmail}:`, emailError);
      }
    }
  }

  return { userEmailsSent, ownerEmailsSent, bookingsChecked: pendingBookings.length };
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "pending-payment" ? "pending-payment" : "daily-confirmed";

    if (mode === "pending-payment") {
      const result = await sendPendingPaymentReminders(supabase);
      return new Response(
        JSON.stringify({ success: true, mode, ...result }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const result = await sendDailyConfirmedBookingReminders(supabase);

    return new Response(
      JSON.stringify({
        success: true,
        mode,
        ...result,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-booking-reminders:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
