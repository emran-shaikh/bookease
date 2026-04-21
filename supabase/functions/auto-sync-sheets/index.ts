import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabaseAdmin.functions.invoke("sync-sheet", {
      body: {
        action: "auto_pull_all",
      },
    });

    if (error) {
      throw new Error(error.message || "Failed to invoke sync-sheet auto pull");
    }

    return new Response(JSON.stringify({ success: true, ...(data || {}) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message || "auto-sync failed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
