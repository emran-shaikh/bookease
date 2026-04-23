import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type SyncAction =
  | "get_capabilities"
  | "initialize_sheet"
  | "sync_to_sheet"
  | "sync_from_sheet"
  | "full_sync"
  | "sync_recent"
  | "auto_pull_all"
  | "replay_last_failed_run";

type BookingRow = {
  id: string;
  court_id: string;
  user_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  payment_status: string;
  total_price: number;
  payment_screenshot: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  source_updated_at: string;
  source_updated_by: "site" | "sheet";
  profiles?: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

type SheetIntegration = {
  id: string;
  owner_id: string;
  platform: string;
  sheet_url: string;
  sheet_name: string | null;
  last_push_at: string | null;
  last_pull_at: string | null;
  last_synced_at: string | null;
  auto_sync_enabled: boolean;
};

type LinkRow = {
  integration_id: string;
  booking_id: string;
  sheet_row_key: string;
  row_hash: string | null;
  last_seen_at: string | null;
  is_deleted: boolean;
};

const HEADERS = [
  "Booking ID",
  "Booking UUID",
  "Court Name",
  "Booking Date",
  "Start Time",
  "End Time",
  "Customer Name",
  "Customer Phone",
  "Customer Email",
  "Status",
  "Payment Status",
  "Total Price (Rs.)",
  "Payment Screenshot",
  "Notes",
  "Source Updated At",
  "Created At",
  "Sync Status",
  "Sync Error",
];

const LAST_COL = "R";
const COLS = `A:${LAST_COL}`;
const SYNC_STATUS_COL = "Q";
const SYNC_ERROR_COL = "R";

const VALID_STATUS = new Set(["pending", "confirmed", "cancelled", "completed"]);
const VALID_PAYMENT_STATUS = new Set(["pending", "succeeded", "failed", "refunded"]);

const REQUIRED_COLUMN_INDEXES = {
  court_name: 2,
  booking_date: 3,
  start_time: 4,
  end_time: 5,
} as const;

function formatSheetRange(sheetName: string, a1Range: string) {
  const escaped = sheetName.replace(/'/g, "''");
  return `'${escaped}'!${a1Range}`;
}

const toIso = (value?: string | null) => {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

function normalizeTime(value: string): string {
  const v = value.trim();
  if (/^\d{2}:\d{2}$/.test(v)) return `${v}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v;
  throw new Error(`Invalid time format: ${value}`);
}

function normalizeDate(value: string): string {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date format: ${value}`);
  return d.toISOString().slice(0, 10);
}

function shortBookingId(uuid: string) {
  return uuid.slice(0, 8).toUpperCase();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function extractGoogleSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signInput = `${encodedHeader}.${encodedPayload}`;

  const pemContents = serviceAccount.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signInput));

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signInput}.${encodedSignature}`;

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

async function googleSheetsRequest(sheetId: string, range: string, method = "GET", body?: any) {
  const GOOGLE_SERVICE_ACCOUNT_KEY = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error("Google service account key missing. Configure GOOGLE_SERVICE_ACCOUNT_KEY.");
  }

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch {
    throw new Error("Invalid GOOGLE_SERVICE_ACCOUNT_KEY format. Must be valid JSON.");
  }

  const token = await getGoogleAccessToken(serviceAccount);
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

  const url = (() => {
    if (method === "POST") {
      return `${baseUrl}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    }

    if (method === "PUT") {
      return `${baseUrl}/values/${range}?valueInputOption=USER_ENTERED`;
    }

    return `${baseUrl}/values/${range}`;
  })();

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 403 && errText.includes("SERVICE_DISABLED")) {
      throw new Error("Google Sheets API is disabled in your Google Cloud project. Enable both Google Sheets API and Google Drive API, then retry.");
    }
    if (response.status === 403 && errText.includes("The caller does not have permission")) {
      throw new Error("Service account has no access to this sheet. Share the sheet with the service account email as Editor.");
    }
    throw new Error(`Google Sheets API error (${response.status}): ${errText}`);
  }

  return response.json();
}

async function getSpreadsheetSheetTitles(sheetId: string): Promise<string[]> {
  const GOOGLE_SERVICE_ACCOUNT_KEY = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!GOOGLE_SERVICE_ACCOUNT_KEY) return [];

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch {
    return [];
  }

  const token = await getGoogleAccessToken(serviceAccount);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) return [];
  const data = await response.json();
  return (data?.sheets || []).map((sheet: any) => sheet?.properties?.title).filter(Boolean);
}

async function computeRowHash(row: string[]) {
  const data = new TextEncoder().encode(JSON.stringify(row));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseSheetRow(row: string[], fallbackRowIndex: number) {
  const bookingUuid = (row[1] || "").trim();
  const rowKey = bookingUuid && isUuid(bookingUuid) ? bookingUuid : `row_${fallbackRowIndex}`;

  return {
    booking_id_short: (row[0] || "").trim(),
    booking_uuid: bookingUuid,
    row_key: rowKey,
    court_name: (row[2] || "").trim(),
    booking_date: (row[3] || "").trim(),
    start_time: (row[4] || "").trim(),
    end_time: (row[5] || "").trim(),
    customer_name: (row[6] || "").trim(),
    customer_phone: (row[7] || "").trim(),
    customer_email: (row[8] || "").trim(),
    status: (row[9] || "").trim().toLowerCase(),
    payment_status: (row[10] || "").trim().toLowerCase(),
    total_price: (row[11] || "").trim(),
    payment_screenshot: (row[12] || "").trim(),
    notes: (row[13] || "").trim(),
    source_updated_at: (row[14] || "").trim(),
    created_at: (row[15] || "").trim(),
  };
}

function validateRequiredSheetColumns(rows: string[][]) {
  const header = rows[0] || [];
  const required = [
    { key: "court_name", expected: HEADERS[REQUIRED_COLUMN_INDEXES.court_name], index: REQUIRED_COLUMN_INDEXES.court_name },
    { key: "booking_date", expected: HEADERS[REQUIRED_COLUMN_INDEXES.booking_date], index: REQUIRED_COLUMN_INDEXES.booking_date },
    { key: "start_time", expected: HEADERS[REQUIRED_COLUMN_INDEXES.start_time], index: REQUIRED_COLUMN_INDEXES.start_time },
    { key: "end_time", expected: HEADERS[REQUIRED_COLUMN_INDEXES.end_time], index: REQUIRED_COLUMN_INDEXES.end_time },
  ] as const;

  const mismatches = required
    .map((col) => {
      const actual = String(header[col.index] || "").trim();
      const expected = col.expected;
      if (actual.toLowerCase() !== expected.toLowerCase()) {
        return `Column ${String.fromCharCode(65 + col.index)} must be '${expected}' (found '${actual || "empty"}')`;
      }
      return null;
    })
    .filter(Boolean) as string[];

  if (mismatches.length) {
    throw new Error(`Sheet column validation failed. ${mismatches.join("; ")}`);
  }
}

function toSheetRow(booking: BookingRow, courtName: string) {
  return [
    shortBookingId(booking.id),
    booking.id,
    courtName,
    booking.booking_date,
    booking.start_time.slice(0, 5),
    booking.end_time.slice(0, 5),
    booking.profiles?.full_name || "",
    booking.profiles?.phone || "",
    booking.profiles?.email || "",
    booking.status,
    booking.payment_status,
    String(booking.total_price ?? 0),
    booking.payment_screenshot || "",
    booking.notes || "",
    toIso(booking.source_updated_at),
    booking.created_at ? new Date(booking.created_at).toISOString() : new Date().toISOString(),
    "",
    "",
  ];
}

async function hasBookingOverlap(
  supabaseAdmin: any,
  courtId: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string,
) {
  let query = supabaseAdmin
    .from("bookings")
    .select("id, start_time, end_time, status")
    .eq("court_id", courtId)
    .eq("booking_date", bookingDate)
    .in("status", ["pending", "confirmed"]);

  if (excludeBookingId) query = query.neq("id", excludeBookingId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed overlap check: ${error.message}`);

  const incomingStart = normalizeTime(startTime);
  const incomingEnd = normalizeTime(endTime);

  return (data || []).some((row: any) => {
    const existingStart = normalizeTime(row.start_time);
    const existingEnd = normalizeTime(row.end_time);
    return incomingStart < existingEnd && incomingEnd > existingStart;
  });
}

async function writeSheetFeedback(
  sheetId: string,
  sheetName: string,
  rowNumber: number,
  status: string,
  errorMessage = "",
) {
  await googleSheetsRequest(
    sheetId,
    formatSheetRange(sheetName, `${SYNC_STATUS_COL}${rowNumber}:${SYNC_ERROR_COL}${rowNumber}`),
    "PUT",
    { values: [[status, errorMessage]] },
  );
}

async function sendSheetBookingConfirmationEmail(payload: {
  customerEmail: string;
  customerName: string;
  courtName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
}) {
  if (!payload.customerEmail) return { sent: false, reason: "missing_customer_email" as const };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-booking-confirmation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      userEmail: payload.customerEmail,
      userName: payload.customerName || "Customer",
      courtName: payload.courtName,
      bookingDate: payload.bookingDate,
      startTime: payload.startTime,
      endTime: payload.endTime,
      totalPrice: payload.totalPrice,
      isManualBooking: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send confirmation email: ${text}`);
  }

  const result = await response.json().catch(() => ({}));
  if (result?.success === false) {
    throw new Error(`Failed to send confirmation email: ${result.error || "unknown error"}`);
  }

  return { sent: true };
}

async function getIntegration(supabaseAdmin: any, integrationId: string, ownerId?: string): Promise<SheetIntegration> {
  let query = supabaseAdmin
    .from("sheet_integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("is_active", true);

  if (ownerId) query = query.eq("owner_id", ownerId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to load integration: ${error.message}`);
  if (!data) throw new Error("Integration not found or inactive");
  return data as SheetIntegration;
}

async function getOwnerCourtData(supabaseAdmin: any, ownerId: string) {
  const { data: courts, error } = await supabaseAdmin
    .from("courts")
    .select("id, name")
    .eq("owner_id", ownerId);

  if (error) throw new Error(`Failed to load courts: ${error.message}`);

  const courtIds = (courts || []).map((c: any) => c.id);
  const courtNameById = Object.fromEntries((courts || []).map((c: any) => [c.id, c.name]));
  const courtIdByName = Object.fromEntries((courts || []).map((c: any) => [String(c.name).trim().toLowerCase(), c.id]));

  return { courtIds, courtNameById, courtIdByName };
}

async function ensureHeader(integration: SheetIntegration) {
  if (integration.platform !== "google_sheets") {
    throw new Error("Only Google Sheets is supported for two-way incremental sync.");
  }

  const sheetId = extractGoogleSheetId(integration.sheet_url);
  if (!sheetId) throw new Error("Invalid Google Sheet URL");

  const configuredSheetName = (integration.sheet_name || "Bookings").trim();
  const availableTitles = await getSpreadsheetSheetTitles(sheetId);
  const hasConfigured = availableTitles.includes(configuredSheetName);
  const fallbackName = availableTitles.includes("Bookings") ? "Bookings" : (availableTitles[0] || configuredSheetName);
  const sheetName = hasConfigured ? configuredSheetName : fallbackName;
  const range = formatSheetRange(sheetName, COLS);

  const read = await googleSheetsRequest(sheetId, range, "GET");
  const rows: string[][] = read.values || [];

  if (!rows.length) {
    await googleSheetsRequest(sheetId, formatSheetRange(sheetName, "A1:R1"), "PUT", { values: [HEADERS] });
    return { sheetId, sheetName, rows: [HEADERS] as string[][] };
  }

  const first = rows[0] || [];
  if ((first[1] || "").trim() !== "Booking UUID" || first.length < HEADERS.length) {
    rows[0] = HEADERS;
    await googleSheetsRequest(sheetId, formatSheetRange(sheetName, `A1:R${rows.length}`), "PUT", { values: rows });
  }

  return { sheetId, sheetName, rows };
}

async function setIntegrationStatus(supabaseAdmin: any, integrationId: string, patch: Record<string, unknown>) {
  await supabaseAdmin
    .from("sheet_integrations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", integrationId);
}

async function logSync(supabaseAdmin: any, payload: Record<string, unknown>) {
  await supabaseAdmin.from("sheet_sync_logs").insert(payload);
}

async function loadLinks(supabaseAdmin: any, integrationId: string) {
  const { data, error } = await supabaseAdmin
    .from("sheet_booking_links")
    .select("integration_id, booking_id, sheet_row_key, row_hash, last_seen_at, is_deleted")
    .eq("integration_id", integrationId);

  if (error) throw new Error(`Failed loading sync links: ${error.message}`);
  return (data || []) as LinkRow[];
}

async function upsertLinks(supabaseAdmin: any, rows: Array<Partial<LinkRow> & { integration_id: string; booking_id: string; sheet_row_key: string }>) {
  if (!rows.length) return;
  const { error } = await supabaseAdmin
    .from("sheet_booking_links")
    .upsert(rows, { onConflict: "integration_id,sheet_row_key" });
  if (error) throw new Error(`Failed to upsert sync links: ${error.message}`);
}

async function syncToSheet(supabaseAdmin: any, integration: SheetIntegration, runType: "manual" | "auto" = "manual") {
  await setIntegrationStatus(supabaseAdmin, integration.id, { sync_status: "syncing", sync_error: null });

  const startedAt = new Date().toISOString();
  const nowIso = new Date().toISOString();

  try {
    const { sheetId, sheetName, rows } = await ensureHeader(integration);
    const { courtIds, courtNameById } = await getOwnerCourtData(supabaseAdmin, integration.owner_id);

    if (!courtIds.length) {
      await setIntegrationStatus(supabaseAdmin, integration.id, {
        sync_status: "success",
        last_push_at: nowIso,
        last_synced_at: nowIso,
      });
      return { message: "No courts found for owner", records_updated: 0, records_created: 0, records_skipped: 0 };
    }

    let query = supabaseAdmin
      .from("bookings")
      .select("*, profiles(full_name, email, phone)")
      .in("court_id", courtIds)
      .order("source_updated_at", { ascending: true });

    if (integration.last_push_at) {
      query = query.gt("source_updated_at", integration.last_push_at).eq("source_updated_by", "site");
    }

    const { data: changedBookings, error: bookingError } = await query;
    if (bookingError) throw new Error(`Failed to load bookings: ${bookingError.message}`);

    const changed = (changedBookings || []) as BookingRow[];
    if (!changed.length) {
      await setIntegrationStatus(supabaseAdmin, integration.id, {
        sync_status: "success",
        last_push_at: nowIso,
        last_synced_at: nowIso,
      });

      await logSync(supabaseAdmin, {
        integration_id: integration.id,
        direction: "to_sheet",
        run_type: runType,
        records_synced: 0,
        records_failed: 0,
        records_created: 0,
        records_updated: 0,
        records_cancelled: 0,
        records_skipped: 0,
        records_conflicted: 0,
        completed_at: nowIso,
      });

      return { message: "No website-side changes to push", records_updated: 0, records_created: 0, records_skipped: 0 };
    }

    const links = await loadLinks(supabaseAdmin, integration.id);
    const linkByBooking = new Map(links.map((l) => [l.booking_id, l]));

    const uuidToRowIndex = new Map<string, number>();
    rows.forEach((r, idx) => {
      const uuid = (r?.[1] || "").trim();
      if (uuid && isUuid(uuid)) uuidToRowIndex.set(uuid, idx + 1);
    });

    let updated = 0;
    let created = 0;
    let skipped = 0;
    const linkUpserts: Array<{ integration_id: string; booking_id: string; sheet_row_key: string; row_hash: string; last_seen_at: string; is_deleted: boolean }> = [];

    for (const booking of changed) {
      const rowData = toSheetRow(booking, courtNameById[booking.court_id] || "Unknown");
      const rowHash = await computeRowHash(rowData);
      const existingLink = linkByBooking.get(booking.id);
      const rowKey = booking.id;

      const knownRowIdx = uuidToRowIndex.get(booking.id);
      if (knownRowIdx) {
        await googleSheetsRequest(sheetId, formatSheetRange(sheetName, `A${knownRowIdx}:R${knownRowIdx}`), "PUT", { values: [rowData] });
        updated += 1;
      } else {
        await googleSheetsRequest(sheetId, formatSheetRange(sheetName, COLS), "POST", { values: [rowData] });
        created += 1;
      }

      linkUpserts.push({
        integration_id: integration.id,
        booking_id: booking.id,
        sheet_row_key: rowKey,
        row_hash: rowHash,
        last_seen_at: nowIso,
        is_deleted: false,
      });

      if (existingLink?.row_hash === rowHash) skipped += 1;
    }

    await upsertLinks(supabaseAdmin, linkUpserts);

    await setIntegrationStatus(supabaseAdmin, integration.id, {
      sync_status: "success",
      sync_error: null,
      last_push_at: nowIso,
      last_synced_at: nowIso,
    });

    await logSync(supabaseAdmin, {
      integration_id: integration.id,
      direction: "to_sheet",
      run_type: runType,
      started_at: startedAt,
      records_synced: updated + created,
      records_failed: 0,
      records_created: created,
      records_updated: updated,
      records_cancelled: 0,
      records_skipped: skipped,
      records_conflicted: 0,
      completed_at: nowIso,
    });

    return {
      message: `Pushed ${updated + created} change(s) to sheet`,
      records_updated: updated,
      records_created: created,
      records_skipped: skipped,
    };
  } catch (error: any) {
    await setIntegrationStatus(supabaseAdmin, integration.id, {
      sync_status: "error",
      sync_error: error.message,
    });

    await logSync(supabaseAdmin, {
      integration_id: integration.id,
      direction: "to_sheet",
      run_type: runType,
      records_synced: 0,
      records_failed: 1,
      records_created: 0,
      records_updated: 0,
      records_cancelled: 0,
      records_skipped: 0,
      records_conflicted: 0,
      error_details: error.message,
      completed_at: new Date().toISOString(),
    });

    throw error;
  }
}

async function resolveUserId(supabaseAdmin: any, ownerId: string, customerEmail: string, customerPhone: string) {
  if (customerEmail) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", customerEmail)
      .limit(1);
    if (data?.[0]?.id) return data[0].id as string;
  }

  if (customerPhone) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .or(`phone.eq.${customerPhone},whatsapp_number.eq.${customerPhone}`)
      .limit(1);
    if (data?.[0]?.id) return data[0].id as string;
  }

  return ownerId;
}

async function syncFromSheet(supabaseAdmin: any, integration: SheetIntegration, runType: "manual" | "auto" = "manual") {
  await setIntegrationStatus(supabaseAdmin, integration.id, { sync_status: "syncing", sync_error: null });

  const startedAt = new Date().toISOString();
  const nowIso = new Date().toISOString();

  try {
    const { sheetId, sheetName, rows } = await ensureHeader(integration);
    try {
      validateRequiredSheetColumns(rows);
    } catch (validationError: any) {
      await writeSheetFeedback(sheetId, sheetName, 1, "INVALID_SCHEMA", validationError.message || "Sheet columns are invalid");
      throw validationError;
    }
    const { courtIds, courtIdByName } = await getOwnerCourtData(supabaseAdmin, integration.owner_id);

    if (!courtIds.length) {
      await setIntegrationStatus(supabaseAdmin, integration.id, {
        sync_status: "success",
        last_pull_at: nowIso,
        last_synced_at: nowIso,
      });
      return { message: "No courts found for owner", records_created: 0, records_updated: 0, records_cancelled: 0, records_conflicted: 0 };
    }

    const { data: existingBookings, error: bookingsError } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .in("court_id", courtIds);

    if (bookingsError) throw new Error(`Failed loading existing bookings: ${bookingsError.message}`);

    const bookingById = new Map((existingBookings || []).map((b: any) => [b.id, b as BookingRow]));

    const links = await loadLinks(supabaseAdmin, integration.id);
    const linksByKey = new Map(links.map((l) => [l.sheet_row_key, l]));

    const seenKeys = new Set<string>();
    const linkUpserts: Array<{ integration_id: string; booking_id: string; sheet_row_key: string; row_hash: string; last_seen_at: string; is_deleted: boolean }> = [];

    let created = 0;
    let updated = 0;
    let cancelled = 0;
    let failed = 0;
    let conflicted = 0;
    let skipped = 0;

    const errors: string[] = [];

    const bodyRows = rows.slice(1);

    for (let idx = 0; idx < bodyRows.length; idx++) {
      const sheetIndex = idx + 2;
      const rawRow = bodyRows[idx] || [];
      if (!rawRow.some((v) => String(v || "").trim().length > 0)) continue;

      try {
        const parsed = parseSheetRow(rawRow, sheetIndex);
        const rowHash = await computeRowHash(rawRow.map((v) => String(v || "")));

        if (!parsed.court_name || !parsed.booking_date || !parsed.start_time || !parsed.end_time) {
          skipped += 1;
          await writeSheetFeedback(sheetId, sheetName, sheetIndex, "INVALID_ROW", "Missing required values: Court Name, Booking Date, Start Time, End Time");
          continue;
        }

        const courtId = courtIdByName[parsed.court_name.toLowerCase()];
        if (!courtId) {
          failed += 1;
          errors.push(`Row ${sheetIndex}: Unknown court '${parsed.court_name}'`);
          await writeSheetFeedback(sheetId, sheetName, sheetIndex, "INVALID_COURT", `Unknown court '${parsed.court_name}'`);
          continue;
        }

        const incomingStatus = VALID_STATUS.has(parsed.status) ? parsed.status : "confirmed";
        const incomingPayment = VALID_PAYMENT_STATUS.has(parsed.payment_status) ? parsed.payment_status : "pending";
        const incomingSourceUpdatedAt = toIso(parsed.source_updated_at || new Date().toISOString());
        const normalizedDate = normalizeDate(parsed.booking_date);
        const normalizedStart = normalizeTime(parsed.start_time);
        const normalizedEnd = normalizeTime(parsed.end_time);

        let booking: BookingRow | undefined;
        const hasBookingUuid = parsed.booking_uuid.length > 0;

        if (hasBookingUuid && !isUuid(parsed.booking_uuid)) {
          failed += 1;
          errors.push(`Row ${sheetIndex}: Booking UUID is invalid.`);
          await writeSheetFeedback(sheetId, sheetName, sheetIndex, "INVALID_UUID", "Booking UUID is invalid");
          continue;
        }

        if (hasBookingUuid) {
          booking = bookingById.get(parsed.booking_uuid);
          const linkedByUuid = linksByKey.get(parsed.booking_uuid);
          if (linkedByUuid && linkedByUuid.booking_id !== parsed.booking_uuid) {
            failed += 1;
            errors.push(`Row ${sheetIndex}: Booking UUID does not match linked booking mapping.`);
            await writeSheetFeedback(sheetId, sheetName, sheetIndex, "UUID_MISMATCH", "Booking UUID does not match linked row mapping");
            continue;
          }

          if (!booking) {
            failed += 1;
            errors.push(`Row ${sheetIndex}: Booking UUID not found on website, cannot update.`);
            await writeSheetFeedback(sheetId, sheetName, sheetIndex, "UUID_NOT_FOUND", "Booking UUID not found on website");
            continue;
          }
        }

        if (!booking && linksByKey.has(parsed.row_key)) {
          const linked = linksByKey.get(parsed.row_key)!;
          booking = bookingById.get(linked.booking_id);
        }

        if (!booking) {
          const overlapsExisting = await hasBookingOverlap(
            supabaseAdmin,
            courtId,
            normalizedDate,
            normalizedStart,
            normalizedEnd,
          );

          if (overlapsExisting) {
            conflicted += 1;
            errors.push(`Row ${sheetIndex}: Slot overlaps an existing booking.`);
            await writeSheetFeedback(sheetId, sheetName, sheetIndex, "OVERLAP", "Slot overlaps an existing confirmed/pending booking");
            continue;
          }

          const userId = await resolveUserId(supabaseAdmin, integration.owner_id, parsed.customer_email, parsed.customer_phone);

          const insertPayload = {
            court_id: courtId,
            user_id: userId,
            booking_date: normalizedDate,
            start_time: normalizedStart,
            end_time: normalizedEnd,
            total_price: Number(parsed.total_price || 0),
            status: incomingStatus,
            payment_status: incomingPayment,
            payment_screenshot: parsed.payment_screenshot || null,
            notes: parsed.notes || "Added from spreadsheet",
            source_updated_at: incomingSourceUpdatedAt,
            source_updated_by: "sheet",
          };

          const { data: newBooking, error: insertError } = await supabaseAdmin
            .from("bookings")
            .insert(insertPayload)
            .select("*")
            .maybeSingle();

          if (insertError) {
            failed += 1;
            errors.push(`Row ${sheetIndex}: ${insertError.message}`);
            await writeSheetFeedback(sheetId, sheetName, sheetIndex, "INSERT_FAILED", insertError.message);
            continue;
          }

          let syncStatus = "CREATED";
          let syncError = "";
          if (incomingStatus === "confirmed" && parsed.customer_email) {
            try {
              await sendSheetBookingConfirmationEmail({
                customerEmail: parsed.customer_email,
                customerName: parsed.customer_name,
                courtName: parsed.court_name,
                bookingDate: normalizedDate,
                startTime: normalizedStart.slice(0, 5),
                endTime: normalizedEnd.slice(0, 5),
                totalPrice: Number(parsed.total_price || 0),
              });
              syncStatus = "CREATED+EMAILED";
            } catch (emailError: any) {
              syncStatus = "CREATED_EMAIL_FAILED";
              syncError = emailError.message || "Booking created but confirmation email failed";
            }
          }

          await writeSheetFeedback(sheetId, sheetName, sheetIndex, syncStatus, syncError);

          created += 1;
          seenKeys.add(parsed.row_key);

          linkUpserts.push({
            integration_id: integration.id,
            booking_id: newBooking.id,
            sheet_row_key: parsed.row_key,
            row_hash: rowHash,
            last_seen_at: nowIso,
            is_deleted: false,
          });

          bookingById.set(newBooking.id, newBooking as BookingRow);
          continue;
        }

        const existingSourceTs = toIso(booking.source_updated_at || booking.updated_at);
        if (new Date(incomingSourceUpdatedAt) < new Date(existingSourceTs)) {
          conflicted += 1;
          seenKeys.add(parsed.row_key);

          await writeSheetFeedback(sheetId, sheetName, sheetIndex, "STALE_ROW", "Website has a newer update; sheet row ignored");

          linkUpserts.push({
            integration_id: integration.id,
            booking_id: booking.id,
            sheet_row_key: parsed.row_key,
            row_hash: rowHash,
            last_seen_at: nowIso,
            is_deleted: false,
          });
          continue;
        }

        const overlapsExisting = await hasBookingOverlap(
          supabaseAdmin,
          courtId,
          normalizedDate,
          normalizedStart,
          normalizedEnd,
          booking.id,
        );

        if (overlapsExisting) {
          conflicted += 1;
          errors.push(`Row ${sheetIndex}: Update would overlap an existing booking.`);
          await writeSheetFeedback(sheetId, sheetName, sheetIndex, "OVERLAP", "Update rejected: slot overlaps another confirmed/pending booking");
          continue;
        }

        const patch: Record<string, unknown> = {
          booking_date: normalizedDate,
          start_time: normalizedStart,
          end_time: normalizedEnd,
          status: incomingStatus,
          payment_status: incomingPayment,
          total_price: Number(parsed.total_price || booking.total_price || 0),
          payment_screenshot: parsed.payment_screenshot || null,
          notes: parsed.notes || null,
          source_updated_at: incomingSourceUpdatedAt,
          source_updated_by: "sheet",
        };

        const { error: updateError } = await supabaseAdmin
          .from("bookings")
          .update(patch)
          .eq("id", booking.id);

        if (updateError) {
          failed += 1;
          errors.push(`Row ${sheetIndex}: ${updateError.message}`);
          await writeSheetFeedback(sheetId, sheetName, sheetIndex, "UPDATE_FAILED", updateError.message);
          continue;
        }

        let syncStatus = "UPDATED";
        let syncError = "";
        if (incomingStatus === "confirmed" && parsed.customer_email) {
          try {
            await sendSheetBookingConfirmationEmail({
              customerEmail: parsed.customer_email,
              customerName: parsed.customer_name,
              courtName: parsed.court_name,
              bookingDate: normalizedDate,
              startTime: normalizedStart.slice(0, 5),
              endTime: normalizedEnd.slice(0, 5),
              totalPrice: Number(parsed.total_price || booking.total_price || 0),
            });
            syncStatus = "UPDATED+EMAILED";
          } catch (emailError: any) {
            syncStatus = "UPDATED_EMAIL_FAILED";
            syncError = emailError.message || "Booking updated but confirmation email failed";
          }
        }

        await writeSheetFeedback(sheetId, sheetName, sheetIndex, syncStatus, syncError);

        updated += 1;
        seenKeys.add(parsed.row_key);

        linkUpserts.push({
          integration_id: integration.id,
          booking_id: booking.id,
          sheet_row_key: parsed.row_key,
          row_hash: rowHash,
          last_seen_at: nowIso,
          is_deleted: false,
        });
      } catch (rowError: any) {
        failed += 1;
        errors.push(`Row ${sheetIndex}: ${rowError.message}`);
        await writeSheetFeedback(sheetId, sheetName, sheetIndex, "ROW_ERROR", rowError.message || "Unexpected row processing error");
      }
    }

    for (const link of links) {
      if (seenKeys.has(link.sheet_row_key)) continue;
      if (link.is_deleted) continue;

      const booking = bookingById.get(link.booking_id);
      if (!booking) continue;

      if (booking.status === "pending" || booking.status === "confirmed") {
        const { error: cancelError } = await supabaseAdmin
          .from("bookings")
          .update({
            status: "cancelled",
            source_updated_by: "sheet",
            source_updated_at: nowIso,
          })
          .eq("id", booking.id);

        if (!cancelError) cancelled += 1;
      }

      linkUpserts.push({
        integration_id: integration.id,
        booking_id: link.booking_id,
        sheet_row_key: link.sheet_row_key,
        row_hash: link.row_hash || "",
        last_seen_at: nowIso,
        is_deleted: true,
      });
    }

    await upsertLinks(supabaseAdmin, linkUpserts);

    await setIntegrationStatus(supabaseAdmin, integration.id, {
      sync_status: failed > 0 ? "error" : "success",
      sync_error: errors.length ? errors.slice(0, 10).join("; ") : null,
      last_pull_at: nowIso,
      last_synced_at: nowIso,
    });

    await logSync(supabaseAdmin, {
      integration_id: integration.id,
      direction: "from_sheet",
      run_type: runType,
      started_at: startedAt,
      records_synced: created + updated + cancelled,
      records_failed: failed,
      records_created: created,
      records_updated: updated,
      records_cancelled: cancelled,
      records_skipped: skipped,
      records_conflicted: conflicted,
      error_details: errors.length ? errors.join("\n") : null,
      completed_at: nowIso,
    });

    return {
      message: `Pulled ${created + updated + cancelled} change(s) from sheet`,
      records_created: created,
      records_updated: updated,
      records_cancelled: cancelled,
      records_conflicted: conflicted,
      records_failed: failed,
      errors,
    };
  } catch (error: any) {
    await setIntegrationStatus(supabaseAdmin, integration.id, {
      sync_status: "error",
      sync_error: error.message,
    });

    await logSync(supabaseAdmin, {
      integration_id: integration.id,
      direction: "from_sheet",
      run_type: runType,
      records_synced: 0,
      records_failed: 1,
      records_created: 0,
      records_updated: 0,
      records_cancelled: 0,
      records_skipped: 0,
      records_conflicted: 0,
      error_details: error.message,
      completed_at: new Date().toISOString(),
    });

    throw error;
  }
}

async function initializeSheet(supabaseAdmin: any, integration: SheetIntegration) {
  await ensureHeader(integration);
  const push = await syncToSheet(supabaseAdmin, integration, "manual");
  return { success: true, message: `Sheet initialized. ${push.message}` };
}

async function syncAllAutoPull(supabaseAdmin: any) {
  const { data: integrations, error } = await supabaseAdmin
    .from("sheet_integrations")
    .select("*")
    .eq("is_active", true)
    .eq("auto_sync_enabled", true)
    .eq("platform", "google_sheets");

  if (error) throw new Error(`Failed loading active integrations: ${error.message}`);

  let processed = 0;
  const failures: string[] = [];

  for (const integration of integrations || []) {
    try {
      await syncFromSheet(supabaseAdmin, integration as SheetIntegration, "auto");
      processed += 1;
    } catch (e: any) {
      failures.push(`${integration.id}: ${e.message}`);
    }
  }

  return {
    processed,
    failed: failures.length,
    failures,
  };
}

async function syncRecentForOwner(supabaseAdmin: any, ownerId: string) {
  const { data: integrations, error } = await supabaseAdmin
    .from("sheet_integrations")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_active", true)
    .eq("platform", "google_sheets");

  if (error) throw new Error(`Failed loading owner integrations: ${error.message}`);

  let pushed = 0;
  const failures: string[] = [];

  for (const integration of integrations || []) {
    try {
      await syncToSheet(supabaseAdmin, integration as SheetIntegration, "auto");
      pushed += 1;
    } catch (e: any) {
      failures.push(`${integration.id}: ${e.message}`);
    }
  }

  return { pushed, failed: failures.length, failures };
}

async function replayLastFailedRun(supabaseAdmin: any, integrationId: string, ownerId?: string) {
  const integration = await getIntegration(supabaseAdmin, integrationId, ownerId);

  const { data: failedLog, error } = await supabaseAdmin
    .from("sheet_sync_logs")
    .select("direction")
    .eq("integration_id", integrationId)
    .gt("records_failed", 0)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed loading sync logs: ${error.message}`);
  if (!failedLog) throw new Error("No failed sync run found to replay.");

  if (failedLog.direction === "to_sheet") {
    return await syncToSheet(supabaseAdmin, integration, "manual");
  }
  return await syncFromSheet(supabaseAdmin, integration, "manual");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as SyncAction;
    const integrationId = body.integration_id as string | undefined;
    const ownerId = body.owner_id as string | undefined;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === "get_capabilities") {
      const hasGoogle = !!Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
      return new Response(JSON.stringify({
        google_sheets: {
          authenticated: hasGoogle,
          write_enabled: hasGoogle,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "auto_pull_all") {
      const result = await syncAllAutoPull(supabaseAdmin);
      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_recent") {
      if (!ownerId) throw new Error("owner_id is required for sync_recent");
      const result = await syncRecentForOwner(supabaseAdmin, ownerId);
      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!integrationId) throw new Error("integration_id is required");

    const integration = await getIntegration(supabaseAdmin, integrationId, ownerId);

    let result: Record<string, unknown>;

    switch (action) {
      case "initialize_sheet":
        result = await initializeSheet(supabaseAdmin, integration);
        break;
      case "sync_to_sheet":
        result = await syncToSheet(supabaseAdmin, integration, "manual");
        break;
      case "sync_from_sheet":
        result = await syncFromSheet(supabaseAdmin, integration, "manual");
        break;
      case "full_sync":
        await syncToSheet(supabaseAdmin, integration, "manual");
        result = await syncFromSheet(supabaseAdmin, integration, "manual");
        break;
      case "replay_last_failed_run":
        result = await replayLastFailedRun(supabaseAdmin, integrationId, ownerId);
        break;
      default:
        throw new Error("Invalid action");
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message || "Sync failed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
