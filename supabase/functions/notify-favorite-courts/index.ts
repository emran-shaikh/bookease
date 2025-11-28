import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { courtId, type, message } = await req.json();

    if (!courtId || !type || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: courtId, type, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all users who favorited this court
    const { data: favorites, error: favError } = await supabaseClient
      .from('favorites')
      .select('user_id')
      .eq('court_id', courtId);

    if (favError) throw favError;

    if (!favorites || favorites.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No favorites found for this court' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get court name
    const { data: court, error: courtError } = await supabaseClient
      .from('courts')
      .select('name')
      .eq('id', courtId)
      .single();

    if (courtError) throw courtError;

    // Create notifications for all users
    const notifications = favorites.map(fav => ({
      user_id: fav.user_id,
      title: `Update on ${court.name}`,
      message: message,
      type: type,
      related_court_id: courtId,
    }));

    const { error: notifError } = await supabaseClient
      .from('notifications')
      .insert(notifications);

    if (notifError) throw notifError;

    return new Response(
      JSON.stringify({ 
        message: `Notifications sent to ${favorites.length} users`,
        count: favorites.length 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
