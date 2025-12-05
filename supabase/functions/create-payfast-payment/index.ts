import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { encode as base64Encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[PAYFAST-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get request body
    const { courtId, courtName, date, startTime, endTime, totalPrice, basketId } = await req.json();
    logStep("Request data", { courtId, courtName, date, startTime, endTime, totalPrice, basketId });

    // Validate required fields
    if (!courtId || !date || !startTime || !endTime || !totalPrice) {
      throw new Error("Missing required fields: courtId, date, startTime, endTime, totalPrice");
    }

    // Get PayFast credentials from environment
    const merchantId = Deno.env.get("PAYFAST_MERCHANT_ID");
    const securedKey = Deno.env.get("PAYFAST_SECURED_KEY");
    
    if (!merchantId || !securedKey) {
      logStep("PayFast credentials not configured");
      throw new Error("PayFast credentials not configured. Please add PAYFAST_MERCHANT_ID and PAYFAST_SECURED_KEY.");
    }

    // Get user profile for additional details
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('full_name, phone')
      .eq('id', user.id)
      .single();

    // Generate unique order ID
    const orderId = `COURT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // PayFast payment data
    const origin = req.headers.get("origin") || "https://lovable.dev";
    
    const paymentData = {
      MERCHANT_ID: merchantId,
      MERCHANT_NAME: "CourtConnect",
      TOKEN: securedKey,
      PROCCODE: "00", // Purchase transaction
      TXNAMT: Math.round(totalPrice * 100).toString(), // Amount in paisa
      CUSTOMER_MOBILE_NO: profile?.phone || "",
      CUSTOMER_EMAIL_ADDRESS: user.email,
      SIGNATURE: "", // Will be generated
      VERSION: "MERCHANT-CART-0.1",
      TXNDESC: `Court Booking: ${courtName} on ${date} (${startTime} - ${endTime})`,
      SUCCESS_URL: `${origin}/payment-success?order_id=${orderId}`,
      FAILURE_URL: `${origin}/payment-failed?order_id=${orderId}`,
      BASKET_ID: basketId || orderId,
      ORDER_DATE: new Date().toISOString().split('T')[0],
      CHECKOUT_URL: `${origin}/book/${courtId}`,
    };

    // Generate signature (MD5 hash of concatenated values + secured key)
    const signatureString = `${paymentData.MERCHANT_ID}${paymentData.TXNAMT}${paymentData.BASKET_ID}${securedKey}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureString);
    const hashBuffer = await crypto.subtle.digest('MD5', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    paymentData.SIGNATURE = signature.toUpperCase();

    logStep("Payment data prepared", { orderId, amount: totalPrice });

    // Return PayFast form data for redirect
    return new Response(JSON.stringify({
      success: true,
      orderId,
      paymentData,
      // PayFast sandbox URL - change to production URL when going live
      paymentUrl: "https://ipguat.apps.net.pk/Ecommerce/api/Transaction/GetAccessToken",
      formData: paymentData,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
