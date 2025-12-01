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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      userEmail,
      userName,
      courtName,
      bookingDate,
      startTime,
      endTime,
      totalPrice,
      userPhone,
    }: BookingConfirmationRequest = await req.json();

    console.log("Sending booking confirmation email to:", userEmail);

    // Send email using Resend
    const emailResponse = await resend.emails.send({
      from: "Court Booking <onboarding@resend.dev>",
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
              .button {
                display: inline-block;
                background: #667eea;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 6px;
                margin: 20px 0;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1 style="margin: 0;">🎾 Booking Confirmed!</h1>
              <p style="margin: 10px 0 0 0;">Your court reservation is all set</p>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              <p>Great news! Your booking has been confirmed. Here are the details:</p>
              
              <div class="booking-details">
                <div class="detail-row">
                  <span class="detail-label">Court:</span>
                  <span class="detail-value">${courtName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                  <span class="detail-value">${bookingDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Time:</span>
                  <span class="detail-value">${startTime} - ${endTime}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Total Amount:</span>
                  <span class="detail-value total">$${totalPrice.toFixed(2)}</span>
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

    console.log("Email sent successfully:", emailResponse);

    // Note: SMS/Phone notifications would require additional service like Twilio
    // For now, we're just logging if phone is available
    if (userPhone) {
      console.log("Phone notification would be sent to:", userPhone);
      // TODO: Integrate with SMS service like Twilio for actual SMS notifications
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Confirmation email sent successfully",
        emailResponse 
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
    console.error("Error sending confirmation:", error);
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
