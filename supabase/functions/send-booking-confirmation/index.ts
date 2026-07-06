import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BookingConfirmationRequest {
  bookingId?: string;
  userEmail: string;
  userName: string;
  courtName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  userPhone?: string;
  ownerEmail?: string;
  ownerName?: string;
  isPendingPayment?: boolean;
  isManualBooking?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

const toSafeString = (value: unknown, maxLength = 255) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const sanitizeEmail = (value: unknown) => toSafeString(value, 320).toLowerCase();

const parseDisplayDate = (value: string) => {
  const trimmed = value.trim();
  if (DATE_REGEX.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const handler = async (req: Request): Promise<Response> => {
  console.log("=== send-booking-confirmation function invoked ===");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body = await req.json();
    console.log("Request body:", JSON.stringify(body, null, 2));

    const {
      bookingId,
      userEmail,
      userName,
      courtName,
      bookingDate,
      startTime,
      endTime,
      totalPrice,
      userPhone,
      ownerEmail,
      ownerName,
      isPendingPayment,
      isManualBooking,
    }: BookingConfirmationRequest = body;

    const normalizedUserEmail = sanitizeEmail(userEmail);
    const normalizedOwnerEmail = sanitizeEmail(ownerEmail);
    const normalizedCourtName = toSafeString(courtName, 255);
    const normalizedUserName = toSafeString(userName, 120) || "Customer";
    const normalizedOwnerName = toSafeString(ownerName, 120) || "Court Owner";
    const normalizedStartTime = toSafeString(startTime, 8);
    const normalizedEndTime = toSafeString(endTime, 8);
    const normalizedDateFromPayload = parseDisplayDate(toSafeString(bookingDate, 40));
    const numericPrice = Number.parseFloat(String(totalPrice ?? 0));

    if (!normalizedUserEmail || !EMAIL_REGEX.test(normalizedUserEmail)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid userEmail" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!normalizedCourtName) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid courtName" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!normalizedDateFromPayload) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid bookingDate" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!TIME_REGEX.test(normalizedStartTime) || !TIME_REGEX.test(normalizedEndTime)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid booking time" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid totalPrice" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (normalizedOwnerEmail && !EMAIL_REGEX.test(normalizedOwnerEmail)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid ownerEmail" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!bookingId || !/^[0-9a-fA-F-]{36}$/.test(String(bookingId))) {
      return new Response(
        JSON.stringify({ success: false, error: "bookingId is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: actorRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = (actorRoles || []).some((row: any) => row.role === "admin");

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, user_id, court_id, booking_date, start_time, end_time, total_price, courts(id, name, owner_id)")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ success: false, error: "Booking not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const bookingOwnerId = (booking as any)?.courts?.owner_id as string | undefined;
    const canSend = isAdmin || booking.user_id === user.id || (bookingOwnerId && bookingOwnerId === user.id);

    if (!canSend) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const bookingDateIso = new Date(String(booking.booking_date)).toISOString().slice(0, 10);
    const bookingStart = String(booking.start_time).slice(0, 5);
    const bookingEnd = String(booking.end_time).slice(0, 5);
    const bookingCourtName = toSafeString((booking as any)?.courts?.name || "", 255);
    const bookingTotalPrice = Number.parseFloat(String(booking.total_price ?? 0));

    if (
      bookingDateIso !== normalizedDateFromPayload ||
      bookingStart !== normalizedStartTime.slice(0, 5) ||
      bookingEnd !== normalizedEndTime.slice(0, 5) ||
      bookingCourtName.toLowerCase() !== normalizedCourtName.toLowerCase() ||
      Math.abs(bookingTotalPrice - numericPrice) > 0.01
    ) {
      return new Response(
        JSON.stringify({ success: false, error: "Booking payload mismatch" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: bookingUserProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", booking.user_id)
      .maybeSingle();

    if (sanitizeEmail(bookingUserProfile?.email) !== normalizedUserEmail) {
      return new Response(
        JSON.stringify({ success: false, error: "Recipient email does not match booking user" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate required fields
    if (!normalizedUserEmail) {
      console.error("Missing userEmail");
      return new Response(
        JSON.stringify({ success: false, error: "Missing userEmail" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Sending booking confirmation email to:", normalizedUserEmail);
    console.log("Court:", normalizedCourtName, "Date:", normalizedDateFromPayload, "Time:", normalizedStartTime, "-", normalizedEndTime);

    // Check if RESEND_API_KEY is set
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Determine email subject and content based on booking type
    const isManual = isManualBooking === true;
    const emailSubject = isManual 
      ? "Court Slot Reserved for You! 🎾"
      : "Booking Confirmed! 🎉";

    // Send email using Resend
    const emailResponse = await resend.emails.send({
      from: "BookedHours <support@bookedhours.com>",
        to: [normalizedUserEmail],
      subject: emailSubject,
      html: isManual ? `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                padding: 30px;
                border-radius: 10px 10px 0 0;
                text-align: center;
              }
              .content {
                background: #f9fafb;
                padding: 30px;
                border-radius: 0 0 10px 10px;
              }
              .booking-details {
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                border-left: 4px solid #10b981;
              }
              .detail-row {
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                border-bottom: 1px solid #e5e7eb;
              }
              .detail-row:last-child {
                border-bottom: none;
              }
              .detail-label {
                font-weight: 600;
                color: #6b7280;
              }
              .detail-value {
                color: #111827;
              }
              .footer {
                text-align: center;
                margin-top: 30px;
                color: #6b7280;
                font-size: 0.875rem;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1 style="margin: 0;">🎾 Slot Reserved!</h1>
              <p style="margin: 10px 0 0 0;">A court slot has been reserved for you</p>
            </div>
            <div class="content">
              <p>Hi ${normalizedUserName || 'Guest'},</p>
              <p>A court slot has been reserved for you by the court owner. Here are the details:</p>
              
              <div class="booking-details">
                <div class="detail-row">
                  <span class="detail-label">Court:</span>
                   <span class="detail-value">${normalizedCourtName || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                   <span class="detail-value">${normalizedDateFromPayload || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Time:</span>
                   <span class="detail-value">${normalizedStartTime || 'N/A'} - ${normalizedEndTime || 'N/A'}</span>
                </div>
              </div>

              <p><strong>Please Note:</strong></p>
              <ul>
                <li>Please arrive 10 minutes before your reserved time</li>
                <li>Contact the court owner if you have any questions</li>
              </ul>

              <div class="footer">
                <p>Thank you for choosing BookedHours!</p>
                <p>This is an automated notification from the court owner.</p>
              </div>
            </div>
          </body>
        </html>
      ` : `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                border-radius: 10px 10px 0 0;
                text-align: center;
              }
              .content {
                background: #f9fafb;
                padding: 30px;
                border-radius: 0 0 10px 10px;
              }
              .booking-details {
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                border-left: 4px solid #667eea;
              }
              .detail-row {
                display: flex;
                justify-content: space-between;
                padding: 10px 0;
                border-bottom: 1px solid #e5e7eb;
              }
              .detail-row:last-child {
                border-bottom: none;
              }
              .detail-label {
                font-weight: 600;
                color: #6b7280;
              }
              .detail-value {
                color: #111827;
              }
              .total {
                font-size: 1.25rem;
                font-weight: bold;
                color: #667eea;
              }
              .footer {
                text-align: center;
                margin-top: 30px;
                color: #6b7280;
                font-size: 0.875rem;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1 style="margin: 0;">🎾 Booking Confirmed!</h1>
              <p style="margin: 10px 0 0 0;">Your court reservation is all set</p>
            </div>
            <div class="content">
              <p>Hi ${normalizedUserName || 'Customer'},</p>
              <p>Great news! Your booking has been confirmed. Here are the details:</p>
              
              <div class="booking-details">
                <div class="detail-row">
                  <span class="detail-label">Court:</span>
                   <span class="detail-value">${normalizedCourtName || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                   <span class="detail-value">${normalizedDateFromPayload || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Time:</span>
                   <span class="detail-value">${normalizedStartTime || 'N/A'} - ${normalizedEndTime || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Total Amount:</span>
                   <span class="detail-value total">Rs. ${numericPrice.toLocaleString()}</span>
                </div>
              </div>

              <p><strong>Important Information:</strong></p>
              <ul>
                <li>Please arrive 10 minutes before your booking time</li>
                <li>Bring valid ID for verification</li>
                <li>Cancellations must be made at least 24 hours in advance</li>
              </ul>

              <p>If you have any questions, please contact us or the court owner directly.</p>

              <div class="footer">
                <p>Thank you for choosing our platform!</p>
                <p>This is an automated email. Please do not reply.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    console.log("Resend API response:", JSON.stringify(emailResponse, null, 2));

    // Check for Resend error response
    if (emailResponse.error) {
      console.error("Resend error:", emailResponse.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: emailResponse.error.message || "Failed to send email"
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email sent successfully! ID:", emailResponse.data?.id);

    // Send notification email to court owner for pending or confirmed payments
    let ownerEmailId = null;
    if (normalizedOwnerEmail && typeof isPendingPayment === "boolean") {
      console.log("Sending notification to court owner:", normalizedOwnerEmail);

      if (bookingOwnerId && user.id !== bookingOwnerId && !isAdmin) {
        return new Response(
          JSON.stringify({ success: false, error: "Only booking owner/admin can send owner notification" }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { data: verifiedOwnerProfile } = bookingOwnerId
        ? await supabaseAdmin
            .from("profiles")
            .select("email")
            .eq("id", bookingOwnerId)
            .maybeSingle()
        : { data: null };

      if (sanitizeEmail(verifiedOwnerProfile?.email) !== normalizedOwnerEmail) {
        return new Response(
          JSON.stringify({ success: false, error: "ownerEmail mismatch" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      const ownerEmailResponse = await resend.emails.send({
        from: "BookedHours <support@bookedhours.com>",
        to: [normalizedOwnerEmail],
        subject: isPendingPayment ? "🔔 New Booking - Payment Pending" : "✅ Booking Payment Confirmed",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
                }
                .header {
                  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                  color: white;
                  padding: 30px;
                  border-radius: 10px 10px 0 0;
                  text-align: center;
                }
                .content {
                  background: #f9fafb;
                  padding: 30px;
                  border-radius: 0 0 10px 10px;
                }
                .booking-details {
                  background: white;
                  padding: 20px;
                  border-radius: 8px;
                  margin: 20px 0;
                  border-left: 4px solid #f59e0b;
                }
                .detail-row {
                  display: flex;
                  justify-content: space-between;
                  padding: 10px 0;
                  border-bottom: 1px solid #e5e7eb;
                }
                .detail-row:last-child {
                  border-bottom: none;
                }
                .detail-label {
                  font-weight: 600;
                  color: #6b7280;
                }
                .detail-value {
                  color: #111827;
                }
                .total {
                  font-size: 1.25rem;
                  font-weight: bold;
                  color: #f59e0b;
                }
                .action-btn {
                  display: inline-block;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                  padding: 12px 24px;
                  border-radius: 8px;
                  text-decoration: none;
                  font-weight: 600;
                  margin-top: 20px;
                }
                .footer {
                  text-align: center;
                  margin-top: 30px;
                  color: #6b7280;
                  font-size: 0.875rem;
                }
                .pending-badge {
                  background: #fef3c7;
                  color: #92400e;
                  padding: 4px 12px;
                  border-radius: 9999px;
                  font-size: 0.875rem;
                  font-weight: 600;
                }
              </style>
            </head>
            <body>
              <div class="header">
                <h1 style="margin: 0;">${isPendingPayment ? "🔔 New Booking Received" : "✅ Payment Confirmed"}</h1>
                <p style="margin: 10px 0 0 0;">${isPendingPayment ? "Payment pending confirmation" : "Booking is now confirmed"}</p>
              </div>
              <div class="content">
                 <p>Hi ${normalizedOwnerName || 'Court Owner'},</p>
                 <p>${isPendingPayment
                   ? `You have a new booking request for <strong>${normalizedCourtName || 'your court'}</strong>. The customer has submitted their booking and payment is pending.`
                   : `Payment has been confirmed for booking at <strong>${normalizedCourtName || 'your court'}</strong>.`}
                </p>
                
                <div class="booking-details">
                  <div class="detail-row">
                    <span class="detail-label">Customer:</span>
                    <span class="detail-value">${normalizedUserName || 'N/A'}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Email:</span>
                    <span class="detail-value">${normalizedUserEmail || 'N/A'}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Date:</span>
                    <span class="detail-value">${normalizedDateFromPayload || 'N/A'}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Time:</span>
                    <span class="detail-value">${normalizedStartTime || 'N/A'} - ${normalizedEndTime || 'N/A'}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Amount:</span>
                    <span class="detail-value total">Rs. ${numericPrice.toLocaleString()}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="pending-badge">${isPendingPayment ? "⏳ Payment Pending" : "✅ Payment Confirmed"}</span>
                  </div>
                </div>

                <p><strong>What to do next:</strong></p>
                ${isPendingPayment
                  ? `<ul>
                      <li>Wait for the customer to send payment or screenshot via WhatsApp</li>
                      <li>Verify the payment in your bank account</li>
                      <li>Confirm the booking from your Owner Dashboard</li>
                    </ul>`
                  : `<ul>
                      <li>No further action needed for payment confirmation</li>
                      <li>Prepare the court for the booked slot</li>
                    </ul>`}

                <center>
                  <a href="https://bookedhours.com/owner" class="action-btn">Go to Owner Dashboard</a>
                </center>

                <div class="footer">
                  <p>${isPendingPayment ? "This booking will be held for 30 minutes. If payment is not received, it will expire automatically." : "This is an automated payment confirmation update."}</p>
                  <p>Thank you for using BookedHours!</p>
                </div>
              </div>
            </body>
          </html>
        `,
      });

      if (ownerEmailResponse.error) {
        console.error("Failed to send owner email:", ownerEmailResponse.error);
      } else {
        console.log("Owner email sent successfully! ID:", ownerEmailResponse.data?.id);
        ownerEmailId = ownerEmailResponse.data?.id;
      }
    }

    // Note: SMS/Phone notifications would require additional service like Twilio
    if (userPhone) {
      console.log("Phone notification would be sent to:", userPhone);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Confirmation email(s) sent successfully",
        emailId: emailResponse.data?.id,
        ownerEmailId
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-booking-confirmation:", error);
    console.error("Error stack:", error.stack);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json", 
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);