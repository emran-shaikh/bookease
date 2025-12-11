import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get bookings scheduled for approximately 24 hours from now
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStart = new Date(tomorrow);
    tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const tomorrowDateStr = tomorrow.toISOString().split('T')[0];

    console.log(`Checking for bookings on ${tomorrowDateStr}`);

    // Fetch confirmed bookings for tomorrow
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

    console.log(`Found ${bookings?.length || 0} bookings for tomorrow`);

    if (!bookings || bookings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No bookings to remind", count: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let emailsSent = 0;
    let notificationsCreated = 0;

    for (const booking of bookings) {
      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("email, full_name, phone")
        .eq("id", booking.user_id)
        .single();

      if (profileError || !profile) {
        console.error(`Error fetching profile for user ${booking.user_id}:`, profileError);
        continue;
      }

      // Fetch court details
      const { data: court, error: courtError } = await supabase
        .from("courts")
        .select("name, address, city")
        .eq("id", booking.court_id)
        .single();

      if (courtError || !court) {
        console.error(`Error fetching court ${booking.court_id}:`, courtError);
        continue;
      }

      const bookingDate = new Date(booking.booking_date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Format time to 12-hour format
      const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
      };

      const startTime = formatTime(booking.start_time);
      const endTime = formatTime(booking.end_time);

      // Send reminder email
      try {
        await resend.emails.send({
          from: "BookedHours <support@bookedhours.com>",
          to: [profile.email],
          subject: "Reminder: Your Court Booking is Tomorrow! ⏰",
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
                  .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                  .booking-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
                  .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
                  .detail-row:last-child { border-bottom: none; }
                  .detail-label { font-weight: 600; color: #6b7280; }
                  .detail-value { color: #111827; }
                  .reminder-note { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0; }
                  .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 0.875rem; }
                </style>
              </head>
              <body>
                <div class="header">
                  <h1 style="margin: 0;">⏰ Booking Reminder</h1>
                  <p style="margin: 10px 0 0 0;">Your court session is tomorrow!</p>
                </div>
                <div class="content">
                  <p>Hi ${profile.full_name || 'there'},</p>
                  <p>This is a friendly reminder that your court booking is scheduled for <strong>tomorrow</strong>!</p>
                  
                  <div class="booking-details">
                    <div class="detail-row">
                      <span class="detail-label">Court:</span>
                      <span class="detail-value">${court.name}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Location:</span>
                      <span class="detail-value">${court.address}, ${court.city}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Date:</span>
                      <span class="detail-value">${bookingDate}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Time:</span>
                      <span class="detail-value">${startTime} - ${endTime}</span>
                    </div>
                  </div>

                  <div class="reminder-note">
                    <strong>📝 Remember:</strong>
                    <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                      <li>Arrive 10 minutes before your booking time</li>
                      <li>Bring valid ID for verification</li>
                      <li>Wear appropriate sports attire</li>
                    </ul>
                  </div>

                  <p>We look forward to seeing you!</p>

                  <div class="footer">
                    <p>Have a great game! 🎾</p>
                  </div>
                </div>
              </body>
            </html>
          `,
        });
        emailsSent++;
        console.log(`Reminder email sent to ${profile.email}`);
      } catch (emailError) {
        console.error(`Error sending email to ${profile.email}:`, emailError);
      }

      // Create in-app notification
      try {
        const { error: notifError } = await supabase
          .from("notifications")
          .insert({
            user_id: booking.user_id,
            title: "Booking Reminder ⏰",
            message: `Your booking at ${court.name} is tomorrow at ${startTime}. Don't forget to arrive 10 minutes early!`,
            type: "info",
            related_court_id: booking.court_id,
          });

        if (notifError) {
          console.error(`Error creating notification:`, notifError);
        } else {
          notificationsCreated++;
          console.log(`Notification created for user ${booking.user_id}`);
        }
      } catch (notifError) {
        console.error(`Error creating notification:`, notifError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${emailsSent} reminder emails and created ${notificationsCreated} notifications`,
        emailsSent,
        notificationsCreated,
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
