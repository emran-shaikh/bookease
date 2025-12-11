import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BookingConfirmationRequest {
  bookingId: string;
  userEmail: string;
  userName: string;
  courtName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  userPhone?: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("=== send-booking-confirmation function invoked ===");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Request body:", JSON.stringify(body, null, 2));

    const {
      userEmail,
      userName,
      courtName,
      bookingDate,
      startTime,
      endTime,
      totalPrice,
      userPhone,
    }: BookingConfirmationRequest = body;

    // Validate required fields
    if (!userEmail) {
      console.error("Missing userEmail");
      return new Response(
        JSON.stringify({ success: false, error: "Missing userEmail" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Sending booking confirmation email to:", userEmail);
    console.log("Court:", courtName, "Date:", bookingDate, "Time:", startTime, "-", endTime);

    // Check if RESEND_API_KEY is set
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send email using Resend
    const emailResponse = await resend.emails.send({
      from: "BookedHours <support@bookedhours.com>",
      to: [userEmail],
      subject: "Booking Confirmed! 🎉",
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
              <p>Hi ${userName || 'Customer'},</p>
              <p>Great news! Your booking has been confirmed. Here are the details:</p>
              
              <div class="booking-details">
                <div class="detail-row">
                  <span class="detail-label">Court:</span>
                  <span class="detail-value">${courtName || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                  <span class="detail-value">${bookingDate || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Time:</span>
                  <span class="detail-value">${startTime || 'N/A'} - ${endTime || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Total Amount:</span>
                  <span class="detail-value total">$${(totalPrice || 0).toFixed(2)}</span>
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

    // Note: SMS/Phone notifications would require additional service like Twilio
    if (userPhone) {
      console.log("Phone notification would be sent to:", userPhone);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Confirmation email sent successfully",
        emailId: emailResponse.data?.id
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