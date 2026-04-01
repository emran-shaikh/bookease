import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SheetRow {
  booking_id: string;
  court_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  status: string;
  payment_status: string;
  total_price: string;
  payment_screenshot: string;
  notes: string;
  created_at: string;
}

// Extract Google Sheet ID from URL
function extractGoogleSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Extract Excel Online workbook info from URL
function extractExcelInfo(url: string): { driveId?: string; itemId?: string } | null {
  // OneDrive/SharePoint URL patterns
  const match = url.match(/(?:onedrive|sharepoint)\.com.*?\/([^/?]+)\?/);
  return match ? { itemId: match[1] } : null;
}

// Google Sheets API helper
async function googleSheetsRequest(
  sheetId: string,
  range: string,
  method: string = "GET",
  body?: any
) {
  const GOOGLE_SERVICE_ACCOUNT_KEY = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!GOOGLE_SERVICE_ACCOUNT_KEY) {
    // Simple mode: allow reading from publicly shared sheets without credentials
    if (method === "GET") {
      return await googleSheetsPublicRead(sheetId, range);
    }

    throw new Error(
      "This action needs authenticated Google Sheets write access. For simple mode, share the sheet and use 'From Sheet' sync."
    );
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch {
    throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_KEY format. Must be valid JSON.");
  }

  // Generate JWT token for Google Sheets API
  const token = await getGoogleAccessToken(serviceAccount);

  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
  const url = method === "GET"
    ? `${baseUrl}/values/${encodeURIComponent(range)}`
    : `${baseUrl}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Sheets API error (${response.status}): ${errText}`);
  }
  return response.json();
}

// Read shared/public Google Sheets without service account (simple mode)
async function googleSheetsPublicRead(sheetId: string, range: string) {
  const sheetName = range.includes("!") ? range.split("!")[0] : "Bookings";

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tqx=out:json`;
  const response = await fetch(url);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Unable to read shared Google Sheet (${response.status}): ${errText}`);
  }

  const rawText = await response.text();
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Invalid shared Google Sheet response. Ensure sheet is shared with link access.");
  }

  const payload = JSON.parse(rawText.slice(start, end + 1));
  const cols = payload?.table?.cols || [];
  const rows = payload?.table?.rows || [];

  const values: string[][] = [];

  // Header row from sheet columns
  const headerRow = cols.map((col: any) => String(col?.label || "").trim());
  if (headerRow.some((h: string) => h.length > 0)) {
    values.push(headerRow);
  }

  for (const row of rows) {
    const cells = row?.c || [];
    values.push(
      cells.map((cell: any) => {
        if (!cell) return "";
        if (cell.f !== undefined && cell.f !== null) return String(cell.f);
        if (cell.v !== undefined && cell.v !== null) return String(cell.v);
        return "";
      })
    );
  }

  return { values };
}

// Generate Google OAuth2 access token from service account
async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signInput = `${encodedHeader}.${encodedPayload}`;

  // Import the private key
  const pemKey = serviceAccount.private_key;
  const pemContents = pemKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signInput}.${encodedSignature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Failed to get Google access token: ${errText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// Microsoft Graph API helper for Excel Online
async function excelOnlineRequest(
  fileUrl: string,
  worksheetName: string,
  method: string = "GET",
  body?: any
) {
  const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
  const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");
  const MICROSOFT_TENANT_ID = Deno.env.get("MICROSOFT_TENANT_ID");

  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_TENANT_ID) {
    throw new Error("Microsoft credentials not configured for Excel Online sync.");
  }

  // Get access token via client credentials flow
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!tokenRes.ok) {
    throw new Error("Failed to get Microsoft access token");
  }

  const { access_token } = await tokenRes.json();
  // Use sharing URL to get drive item
  const encodedUrl = btoa(fileUrl).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const baseUrl = `https://graph.microsoft.com/v1.0/shares/u!${encodedUrl}/driveItem/workbook/worksheets('${worksheetName}')`;

  const url = method === "GET"
    ? `${baseUrl}/usedRange`
    : `${baseUrl}/range(address='A1')`;

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
  };

  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Excel Online API error (${response.status}): ${errText}`);
  }
  return response.json();
}

// Header row for the sheet
const HEADER_ROW = [
  "Booking ID", "Court Name", "Booking Date", "Start Time", "End Time",
  "Customer Name", "Customer Phone", "Customer Email", "Status",
  "Payment Status", "Total Price (Rs.)", "Payment Screenshot", "Notes", "Created At"
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { action, integration_id, owner_id } = await req.json();

    if (action === "sync_to_sheet") {
      // Push bookings from DB to sheet
      return await syncToSheet(supabaseAdmin, integration_id, owner_id);
    } else if (action === "sync_from_sheet") {
      // Pull changes from sheet to DB
      return await syncFromSheet(supabaseAdmin, integration_id, owner_id);
    } else if (action === "full_sync") {
      // Bidirectional sync
      const toResult = await syncToSheet(supabaseAdmin, integration_id, owner_id);
      if (toResult.status !== 200) return toResult;
      return await syncFromSheet(supabaseAdmin, integration_id, owner_id);
    } else if (action === "initialize_sheet") {
      // Set up sheet with headers and existing data
      return await initializeSheet(supabaseAdmin, integration_id, owner_id);
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getIntegration(supabaseAdmin: any, integrationId: string, ownerId: string) {
  const { data, error } = await supabaseAdmin
    .from("sheet_integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch integration: ${error.message}`);
  if (!data) throw new Error("Integration not found");
  return data;
}

async function initializeSheet(supabaseAdmin: any, integrationId: string, ownerId: string) {
  const integration = await getIntegration(supabaseAdmin, integrationId, ownerId);

  // Update sync status
  await supabaseAdmin.from("sheet_integrations").update({
    sync_status: "syncing",
    updated_at: new Date().toISOString(),
  }).eq("id", integrationId);

  try {
    // Get all bookings for owner's courts
    const { data: courts } = await supabaseAdmin
      .from("courts")
      .select("id, name")
      .eq("owner_id", ownerId);

    if (!courts || courts.length === 0) {
      throw new Error("No courts found. Create courts first before syncing.");
    }

    const courtIds = courts.map((c: any) => c.id);
    const courtMap = Object.fromEntries(courts.map((c: any) => [c.id, c.name]));

    const { data: bookings } = await supabaseAdmin
      .from("bookings")
      .select("*, profiles(full_name, email, phone)")
      .in("court_id", courtIds)
      .order("booking_date", { ascending: false });

    // Build rows
    const rows = [HEADER_ROW];
    for (const b of bookings || []) {
      rows.push([
        b.id.slice(0, 8).toUpperCase(),
        courtMap[b.court_id] || "Unknown",
        b.booking_date,
        b.start_time?.slice(0, 5) || "",
        b.end_time?.slice(0, 5) || "",
        b.profiles?.full_name || "",
        b.profiles?.phone || "",
        b.profiles?.email || "",
        b.status,
        b.payment_status,
        b.total_price?.toString() || "0",
        b.payment_screenshot || "",
        b.notes || "",
        b.created_at ? new Date(b.created_at).toLocaleString() : "",
      ]);
    }

    if (integration.platform === "google_sheets") {
      const sheetId = extractGoogleSheetId(integration.sheet_url);
      if (!sheetId) throw new Error("Invalid Google Sheet URL");

      const sheetName = integration.sheet_name || "Bookings";
      
      // Clear existing data and write new
      try {
        await googleSheetsRequest(sheetId, `${sheetName}!A:N`, "PUT", {
          values: rows,
        });
      } catch (err: any) {
        // If sheet doesn't exist, try Sheet1
        if (err.message.includes("Unable to parse range")) {
          await googleSheetsRequest(sheetId, `Sheet1!A:N`, "PUT", {
            values: rows,
          });
          // Update the sheet name
          await supabaseAdmin.from("sheet_integrations").update({
            sheet_name: "Sheet1",
          }).eq("id", integrationId);
        } else {
          throw err;
        }
      }
    } else if (integration.platform === "excel_online") {
      // Excel Online: write data
      await excelOnlineRequest(
        integration.sheet_url,
        integration.sheet_name || "Bookings",
        "PATCH",
        { values: rows }
      );
    }

    // Update integration status
    await supabaseAdmin.from("sheet_integrations").update({
      sync_status: "success",
      last_synced_at: new Date().toISOString(),
      sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", integrationId);

    // Log the sync
    await supabaseAdmin.from("sheet_sync_logs").insert({
      integration_id: integrationId,
      direction: "to_sheet",
      records_synced: (bookings || []).length,
      completed_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Sheet initialized with ${(bookings || []).length} bookings`,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    await supabaseAdmin.from("sheet_integrations").update({
      sync_status: "error",
      sync_error: error.message,
      updated_at: new Date().toISOString(),
    }).eq("id", integrationId);

    throw error;
  }
}

async function syncToSheet(supabaseAdmin: any, integrationId: string, ownerId: string) {
  const integration = await getIntegration(supabaseAdmin, integrationId, ownerId);

  await supabaseAdmin.from("sheet_integrations").update({
    sync_status: "syncing",
    updated_at: new Date().toISOString(),
  }).eq("id", integrationId);

  try {
    const { data: courts } = await supabaseAdmin
      .from("courts")
      .select("id, name")
      .eq("owner_id", ownerId);

    const courtIds = courts?.map((c: any) => c.id) || [];
    const courtMap = Object.fromEntries((courts || []).map((c: any) => [c.id, c.name]));

    // Get bookings updated since last sync
    let query = supabaseAdmin
      .from("bookings")
      .select("*, profiles(full_name, email, phone)")
      .in("court_id", courtIds)
      .order("booking_date", { ascending: false });

    const { data: bookings } = await query;

    // Rebuild the entire sheet
    const rows = [HEADER_ROW];
    for (const b of bookings || []) {
      rows.push([
        b.id.slice(0, 8).toUpperCase(),
        courtMap[b.court_id] || "Unknown",
        b.booking_date,
        b.start_time?.slice(0, 5) || "",
        b.end_time?.slice(0, 5) || "",
        b.profiles?.full_name || "",
        b.profiles?.phone || "",
        b.profiles?.email || "",
        b.status,
        b.payment_status,
        b.total_price?.toString() || "0",
        b.payment_screenshot || "",
        b.notes || "",
        b.created_at ? new Date(b.created_at).toLocaleString() : "",
      ]);
    }

    if (integration.platform === "google_sheets") {
      const sheetId = extractGoogleSheetId(integration.sheet_url);
      if (!sheetId) throw new Error("Invalid Google Sheet URL");

      const sheetName = integration.sheet_name || "Bookings";
      await googleSheetsRequest(sheetId, `${sheetName}!A:N`, "PUT", { values: rows });
    } else if (integration.platform === "excel_online") {
      await excelOnlineRequest(
        integration.sheet_url,
        integration.sheet_name || "Bookings",
        "PATCH",
        { values: rows }
      );
    }

    await supabaseAdmin.from("sheet_integrations").update({
      sync_status: "success",
      last_synced_at: new Date().toISOString(),
      sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", integrationId);

    await supabaseAdmin.from("sheet_sync_logs").insert({
      integration_id: integrationId,
      direction: "to_sheet",
      records_synced: (bookings || []).length,
      completed_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Synced ${(bookings || []).length} bookings to sheet`,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    await supabaseAdmin.from("sheet_integrations").update({
      sync_status: "error",
      sync_error: error.message,
      updated_at: new Date().toISOString(),
    }).eq("id", integrationId);
    throw error;
  }
}

async function syncFromSheet(supabaseAdmin: any, integrationId: string, ownerId: string) {
  const integration = await getIntegration(supabaseAdmin, integrationId, ownerId);

  await supabaseAdmin.from("sheet_integrations").update({
    sync_status: "syncing",
    updated_at: new Date().toISOString(),
  }).eq("id", integrationId);

  try {
    let sheetRows: string[][] = [];

    if (integration.platform === "google_sheets") {
      const sheetId = extractGoogleSheetId(integration.sheet_url);
      if (!sheetId) throw new Error("Invalid Google Sheet URL");

      const sheetName = integration.sheet_name || "Bookings";
      const data = await googleSheetsRequest(sheetId, `${sheetName}!A:N`);
      sheetRows = data.values || [];
    } else if (integration.platform === "excel_online") {
      const data = await excelOnlineRequest(
        integration.sheet_url,
        integration.sheet_name || "Bookings"
      );
      sheetRows = data.values || [];
    }

    if (sheetRows.length <= 1) {
      // Only header row or empty
      return new Response(JSON.stringify({
        success: true,
        message: "No data rows found in sheet",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get owner's courts
    const { data: courts } = await supabaseAdmin
      .from("courts")
      .select("id, name")
      .eq("owner_id", ownerId);

    const courtNameToId = Object.fromEntries(
      (courts || []).map((c: any) => [c.name.toLowerCase(), c.id])
    );

    // Get existing bookings
    const courtIds = (courts || []).map((c: any) => c.id);
    const { data: existingBookings } = await supabaseAdmin
      .from("bookings")
      .select("id, status, payment_status, notes")
      .in("court_id", courtIds);

    const existingBookingMap = new Map(
      (existingBookings || []).map((b: any) => [b.id.slice(0, 8).toUpperCase(), b])
    );

    let recordsSynced = 0;
    let recordsFailed = 0;
    const errors: string[] = [];

    // Skip header row, process data rows
    for (let i = 1; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      if (!row || row.length < 5) continue;

      const [
        bookingIdShort, courtName, bookingDate, startTime, endTime,
        customerName, customerPhone, customerEmail, status,
        paymentStatus, totalPrice, _paymentScreenshot, notes
      ] = row;

      try {
        // Check if this is an existing booking (has a known booking ID prefix)
        const existingBooking = existingBookingMap.get(bookingIdShort?.toUpperCase());

        if (existingBooking) {
          // Update existing booking if status changed
          const updates: any = {};
          if (status && status !== existingBooking.status) {
            const validStatuses = ["pending", "confirmed", "cancelled", "completed"];
            if (validStatuses.includes(status.toLowerCase())) {
              updates.status = status.toLowerCase();
            }
          }
          if (paymentStatus && paymentStatus !== existingBooking.payment_status) {
            const validPaymentStatuses = ["pending", "succeeded", "failed", "refunded"];
            if (validPaymentStatuses.includes(paymentStatus.toLowerCase())) {
              updates.payment_status = paymentStatus.toLowerCase();
            }
          }
          if (notes && notes !== existingBooking.notes) {
            updates.notes = notes;
          }

          if (Object.keys(updates).length > 0) {
            // Find the full booking ID
            const fullBooking = (existingBookings || []).find(
              (b: any) => b.id.slice(0, 8).toUpperCase() === bookingIdShort?.toUpperCase()
            );
            if (fullBooking) {
              const { error } = await supabaseAdmin
                .from("bookings")
                .update(updates)
                .eq("id", fullBooking.id);
              if (error) throw error;
              recordsSynced++;
            }
          }
        } else if (bookingDate && startTime && endTime && courtName) {
          // New row added manually in sheet — create a booking
          const courtId = courtNameToId[courtName.toLowerCase()];
          if (!courtId) {
            errors.push(`Row ${i + 1}: Court "${courtName}" not found`);
            recordsFailed++;
            continue;
          }

          // Find or create user by phone/email
          let userId = ownerId; // Default to owner if no customer info
          if (customerPhone || customerEmail) {
            // Try to find existing profile
            let profileQuery = supabaseAdmin.from("profiles").select("id");
            if (customerEmail) {
              profileQuery = profileQuery.eq("email", customerEmail);
            } else if (customerPhone) {
              profileQuery = profileQuery.or(`phone.eq.${customerPhone},whatsapp_number.eq.${customerPhone}`);
            }
            
            const { data: profiles } = await profileQuery.limit(1);
            if (profiles && profiles.length > 0) {
              userId = profiles[0].id;
            }
          }

          // Create the booking
          const { error } = await supabaseAdmin.from("bookings").insert({
            court_id: courtId,
            user_id: userId,
            booking_date: bookingDate,
            start_time: startTime.length === 5 ? `${startTime}:00` : startTime,
            end_time: endTime.length === 5 ? `${endTime}:00` : endTime,
            total_price: parseFloat(totalPrice) || 0,
            status: (status?.toLowerCase() as any) || "confirmed",
            payment_status: (paymentStatus?.toLowerCase() as any) || "pending",
            notes: notes || "Added from spreadsheet",
          });

          if (error) {
            errors.push(`Row ${i + 1}: ${error.message}`);
            recordsFailed++;
          } else {
            recordsSynced++;
          }
        }
      } catch (rowError: any) {
        errors.push(`Row ${i + 1}: ${rowError.message}`);
        recordsFailed++;
      }
    }

    await supabaseAdmin.from("sheet_integrations").update({
      sync_status: errors.length > 0 ? "error" : "success",
      last_synced_at: new Date().toISOString(),
      sync_error: errors.length > 0 ? errors.join("; ") : null,
      updated_at: new Date().toISOString(),
    }).eq("id", integrationId);

    await supabaseAdmin.from("sheet_sync_logs").insert({
      integration_id: integrationId,
      direction: "from_sheet",
      records_synced: recordsSynced,
      records_failed: recordsFailed,
      error_details: errors.length > 0 ? errors.join("\n") : null,
      completed_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Synced ${recordsSynced} records from sheet${recordsFailed > 0 ? `, ${recordsFailed} failed` : ""}`,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    await supabaseAdmin.from("sheet_integrations").update({
      sync_status: "error",
      sync_error: error.message,
      updated_at: new Date().toISOString(),
    }).eq("id", integrationId);
    throw error;
  }
}
