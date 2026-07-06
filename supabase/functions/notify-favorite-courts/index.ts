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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuthClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAuthClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    if (typeof courtId !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(courtId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid courtId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedType = String(type).trim().toLowerCase();
    if (!['success', 'error', 'info'].includes(normalizedType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid notification type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedMessage = String(message).trim().slice(0, 500);
    if (!normalizedMessage) {
      return new Response(
        JSON.stringify({ error: 'Invalid message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify caller is court owner or admin
    const { data: court, error: courtLookupError } = await supabaseClient
      .from('courts')
      .select('id, name, owner_id')
      .eq('id', courtId)
      .maybeSingle();

    if (courtLookupError || !court) {
      return new Response(
        JSON.stringify({ error: 'Court not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdmin = (roles || []).some((r: any) => r.role === 'admin');
    if (!isAdmin && court.owner_id !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Create notifications for all users
    const notifications = favorites.map(fav => ({
      user_id: fav.user_id,
      title: `Update on ${court.name}`,
      message: normalizedMessage,
      type: normalizedType,
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
