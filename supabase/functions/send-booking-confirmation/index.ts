import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

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
    const token = authHeader.replace("Bearer ", "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);

    // Internal (server-to-server) calls from other functions use the service key
    const isServiceCall = !!serviceKey && token === serviceKey;

    let userId: string | null = null;
    if (!isServiceCall) {
      const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !user) {
        console.error("Auth failed:", userError?.message);
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      userId = user.id;
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
      isPendingPayment,
      isManualBooking,
    }: BookingConfirmationRequest = body;

    const hasBookingId = !!bookingId && /^[0-9a-fA-F-]{36}$/.test(String(bookingId));
    const requiresBookingVerification = hasBookingId;

    if (!hasBookingId && isManualBooking !== true) {
      return new Response(
        JSON.stringify({ success: false, error: "bookingId is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: actorRoles } = userId
      ? await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId)
      : { data: [] as any[] };
    const isAdmin = isServiceCall || (actorRoles || []).some((row: any) => row.role === "admin");
    const isCourtOwnerRole = (actorRoles || []).some((row: any) => row.role === "court_owner");

    const { data: booking } = hasBookingId
      ? await supabaseAdmin
          .from("bookings")
          .select("id, user_id, court_id, booking_date, start_time, end_time, total_price, courts(id, name, owner_id, venues(name))")
          .eq("id", bookingId)
          .maybeSingle()
      : { data: null };

    if (hasBookingId && !booking) {
      return new Response(
        JSON.stringify({ success: false, error: "Booking not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const bookingOwnerId = (booking as any)?.courts?.owner_id as string | undefined;
    const canSend = hasBookingId
      ? (isAdmin || booking?.user_id === userId || (bookingOwnerId && bookingOwnerId === userId))
      : (isAdmin || isCourtOwnerRole);

    if (!canSend) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Resolve all details from the database when a booking exists (never trust payload)
    let normalizedUserEmail = sanitizeEmail(userEmail);
    let normalizedUserName = toSafeString(userName, 120) || "Customer";
    let normalizedCourtName = toSafeString(courtName, 255);
    let normalizedStartTime = toSafeString(startTime, 8);
    let normalizedEndTime = toSafeString(endTime, 8);
    let normalizedDateFromPayload = parseDisplayDate(toSafeString(bookingDate, 40));
    let numericPrice = Number.parseFloat(String(totalPrice ?? 0));

    if (booking) {
      const { data: bookingUserProfile } = await supabaseAdmin
        .from("profiles").select("email, full_name").eq("id", booking.user_id).maybeSingle();
      normalizedUserEmail = sanitizeEmail(bookingUserProfile?.email) || normalizedUserEmail;
      normalizedUserName = toSafeString(bookingUserProfile?.full_name, 120) || normalizedUserName;
      const cName = toSafeString((booking as any)?.courts?.name || "", 255);
      const vName = toSafeString((booking as any)?.courts?.venues?.name || "", 255);
      normalizedCourtName = vName && cName && vName !== cName ? `${vName} – ${cName}` : (cName || normalizedCourtName);
      normalizedDateFromPayload = String(booking.booking_date).slice(0, 10);
      normalizedStartTime = String(booking.start_time).slice(0, 5);
      normalizedEndTime = String(booking.end_time).slice(0, 5);
      numericPrice = Number.parseFloat(String(booking.total_price ?? 0));
    }

    if (!normalizedUserEmail || !EMAIL_REGEX.test(normalizedUserEmail)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid userEmail" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    if (!normalizedCourtName || !normalizedDateFromPayload ||
        !TIME_REGEX.test(normalizedStartTime) || !TIME_REGEX.test(normalizedEndTime) ||
        !Number.isFinite(numericPrice) || numericPrice < 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid booking details" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: ownerProfileForName } = bookingOwnerId
      ? await supabaseAdmin.from("profiles").select("full_name").eq("id", bookingOwnerId).maybeSingle()
      : { data: null };
    const normalizedOwnerName = toSafeString(ownerProfileForName?.full_name, 120) || "Court Owner";

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
    const isReserved = isManual || isPendingPayment === true;
    const emailSubject = isReserved
      ? "Slot Reserved – Complete Payment to Confirm ⏳"
      : "Payment Received – Your Booking is Confirmed! 🎉";

    // Send email using Resend
    const emailResponse = await resend.emails.send({
      from: "BookedHours <support@bookedhours.com>",
        to: [normalizedUserEmail],
      subject: emailSubject,
      html: isReserved ? `
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
              <p style="margin: 10px 0 0 0;">Complete your payment to lock in this slot</p>
            </div>
            <div class="content">
              <p>Hi ${normalizedUserName || 'Guest'},</p>
              <p>Your court slot has been reserved. To make sure it is <strong>confirmed</strong> for you, please complete your payment as soon as possible. Here are the details:</p>
              
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
                  <span class="detail-label">Amount Due:</span>
                   <span class="detail-value"><strong>Rs. ${numericPrice.toLocaleString()}</strong></span>
                </div>
              </div>

              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:15px;border-radius:6px;margin:20px 0;">
                <strong>⏳ Action needed: complete your payment</strong><br/>
                Your slot is only held temporarily. Pay now and share your payment screenshot so the court owner can confirm your booking. Unpaid reservations may be released to other players.
              </div>

              <center>
                <a href="https://bookedhours.com/dashboard" style="display:inline-block;background:#10b981;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Complete Payment</a>
              </center>

              <p><strong>Please Note:</strong></p>
              <ul>
                <li>You'll receive a confirmation email as soon as your payment is verified</li>
                <li>Contact the court owner if you have any questions</li>
              </ul>

              <div class="footer">
                <p>Thank you for choosing BookedHours!</p>
                <p>This is an automated notification. Please do not reply.</p>
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
              <p style="margin: 10px 0 0 0;">Thank you for your payment</p>
            </div>
            <div class="content">
              <p>Hi ${normalizedUserName || 'Customer'},</p>
              <p>Thank you for your payment! 🙏 We've received it and your slot is now <strong>confirmed</strong>. We appreciate you choosing BookedHours. Here are your booking details:</p>
              
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
                  <span class="detail-label">Amount Paid:</span>
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
    const { data: verifiedOwnerProfile } = bookingOwnerId
      ? await supabaseAdmin.from("profiles").select("email").eq("id", bookingOwnerId).maybeSingle()
      : { data: null };
    const resolvedOwnerEmail = sanitizeEmail(verifiedOwnerProfile?.email);
    if (resolvedOwnerEmail && EMAIL_REGEX.test(resolvedOwnerEmail) && typeof isPendingPayment === "boolean") {
      console.log("Sending notification to court owner");
      const ownerEmailResponse = await resend.emails.send({
        from: "BookedHours <support@bookedhours.com>",
        to: [resolvedOwnerEmail],
        subject: isPendingPayment ? "🔔 New Booking - Payment Pending" : "✅ Payment Received - Booking Confirmed",
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

    // Admins: only confirmed bookings
    if (isPendingPayment === false && requiresBookingVerification) {
      const { data: adminRoles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
      const adminIds = [...new Set((adminRoles || []).map((r: any) => r.user_id))];
      if (adminIds.length > 0) {
        const { data: adminProfiles } = await supabaseAdmin.from("profiles").select("email").in("id", adminIds);
        const adminEmails = [...new Set((adminProfiles || [])
          .map((p: any) => sanitizeEmail(p.email))
          .filter((e: string) => e && EMAIL_REGEX.test(e) && e !== resolvedOwnerEmail))];
        const { data: courtInfo } = await supabaseAdmin
          .from("courts").select("name, venues(name)").eq("id", (booking as any).court_id).maybeSingle();
        const venueName = (courtInfo as any)?.venues?.name;
        const place = normalizedCourtName;
        for (const adminEmail of adminEmails) {
          const r = await resend.emails.send({
            from: "BookedHours <support@bookedhours.com>",
            to: [adminEmail],
            subject: `✅ Confirmed Booking – ${place}`,
            html: `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; line-height:1.6; color:#333; max-width:600px; margin:0 auto; padding:20px;">
              <h2 style="color:#059669;">✅ Booking Confirmed</h2>
              <p>A booking has been paid and confirmed.</p>
              <p><strong>Venue / Court:</strong> ${place}<br/>
              <strong>Customer:</strong> ${normalizedUserName} (${normalizedUserEmail})<br/>
              <strong>Date:</strong> ${normalizedDateFromPayload}<br/>
              <strong>Time:</strong> ${normalizedStartTime} - ${normalizedEndTime}<br/>
              <strong>Amount:</strong> Rs. ${numericPrice.toLocaleString()}</p>
              <p><a href="https://bookedhours.com/admin">Open Admin Dashboard</a></p>
            </body></html>`,
          });
          if (r.error) console.error("Admin email failed:", r.error);
        }
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