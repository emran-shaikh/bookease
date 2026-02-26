

## How WhatsApp Booking Works — End-to-End Flow

Let me walk through the exact scenario you described: a new user messages on WhatsApp "need court for this saturday 10pm to 12am".

---

### The Conversation Flow

```text
USER (WhatsApp)                         SYSTEM (via n8n + Edge Function)
─────────────────                       ────────────────────────────────

"need court for this                    n8n receives message via WhatsApp
 saturday 10pm to 12am"                Business API trigger
        │                                       │
        │                              n8n calls whatsapp-booking
        │                              edge function with:
        │                              { phone: "+923001234567",
        │                                message: "need court..." }
        │                                       │
        │                              Edge function:
        │                              1. Checks whatsapp_sessions table
        │                                 (no session → new user)
        │                              2. Looks up phone in profiles
        │                                 (not found → guest flow)
        │                              3. AI parses intent:
        │                                 date=Saturday, 10pm-12am
        │                              4. Queries courts table for
        │                                 available slots on that date
        │                              5. Returns response to n8n
        │                                       │
        ◄───────────────────────────────────────┘
"Hi! 👋 I found 3 courts
 available this Saturday
 (Mar 1) from 10:00 PM
 to 12:00 AM:

 1️⃣ Indoor Badminton Court
    FR Sports, Lahore
    Rs. 3,000 (2 hrs)

 2️⃣ Tennis Court A
    City Arena, Lahore
    Rs. 4,500 (2 hrs)

 3️⃣ Basketball Court
    Sports Hub, Islamabad
    Rs. 2,500 (2 hrs)

 Reply with the number
 to book, or type a
 city/sport to filter."
        │
"1"     │
        │──────────────────────────────────────►
        │                              AI understands: book court #1
        │                              Checks: user not registered
        │                                       │
        ◄───────────────────────────────────────┘
"Great choice! Indoor
 Badminton Court on
 Saturday 10 PM - 12 AM.

 To complete your booking,
 I need a few details:
 - Your full name
 - Your email

 (Or sign up at
 bookease.lovable.app
 for faster booking
 next time!)"
        │
"Ali Khan,                              
 ali@email.com"
        │──────────────────────────────────────►
        │                              Edge function:
        │                              1. Creates profile (phone+name+email)
        │                              2. Creates booking record
        │                                 status: pending
        │                              3. Looks up owner payment info
        │                              4. Returns confirmation + payment
        │                                       │
        ◄───────────────────────────────────────┘
"✅ Booking Confirmed!

 Court: Indoor Badminton
 Date: Sat, Mar 1
 Time: 10:00 PM - 12:00 AM
 Total: Rs. 3,000

 💳 Payment Details:
 Bank: Meezan Bank
 Account: FR Sports
 No: 11650112706753

 📱 Owner WhatsApp:
 +92 300 9876543

 Send payment screenshot
 here or on the app.
 Booking ID: #BK-4521"
        │
[sends screenshot]
        │──────────────────────────────────────►
        │                              Saves screenshot to storage
        │                              Updates payment_status
        │                              Notifies owner via webhook
        │                              Updates Google Sheet
        │                                       │
        ◄───────────────────────────────────────┘
"Payment received! ✅
 The court owner will
 confirm your booking
 shortly."
```

---

### What Gets Built

#### 1. Database Changes
- **`whatsapp_sessions` table** — tracks conversation state per phone number (selected court, step in flow, expiry)
- **`n8n_webhook_url` column** on `profiles` — per-owner webhook URL
- **Booking trigger** — fires on INSERT/UPDATE to notify n8n for Google Sheets sync and owner WhatsApp alerts

#### 2. Edge Functions

**`whatsapp-booking`** — the brain of the WhatsApp flow:
- Receives `{ phone, message, media_url? }` from n8n
- Uses AI (Gemini Flash via Lovable AI, free) to parse user intent
- Manages multi-step conversation via `whatsapp_sessions`
- Handles: browse courts, check availability, book, cancel, check bookings, receive payment screenshots
- Returns structured response that n8n sends back via WhatsApp
- For new/unregistered users: collects name + email inline, creates a lightweight profile linked by phone number

**`booking-webhook`** — outbound notifications:
- Fires on every booking status change (created, confirmed, cancelled, completed)
- Sends enriched payload to n8n webhook
- n8n routes to WhatsApp notification + Google Sheets update

#### 3. Owner Dashboard Update
- Add "n8n Webhook URL" field in the payment settings section
- Owners paste their n8n webhook URL to receive booking notifications

#### 4. n8n Workflows (user sets up — guide provided)

**Inbound workflow:**
1. WhatsApp Business trigger (receives user message)
2. HTTP Request → calls `whatsapp-booking` edge function
3. WhatsApp reply → sends response back to user

**Outbound workflow:**
1. Webhook trigger (receives booking changes)
2. WhatsApp node → notifies customer and owner
3. Google Sheets node → appends/updates booking row

---

### Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Guest booking | Yes — collect name+email via chat | Removes friction, user doesn't need an account |
| AI model | Gemini Flash (free via Lovable AI) | No API key needed, fast enough for chat |
| Payment | Show owner's bank details in chat | Matches existing bank transfer flow |
| Screenshot | Accept via WhatsApp media | n8n forwards media URL to edge function |
| Session expiry | 30 minutes | Prevents stale conversations |
| Availability check | Real-time from bookings + blocked_slots | Same logic as court-assistant function |

---

### What's Free

- **Lovable AI gateway** — Gemini Flash for parsing WhatsApp messages (included)
- **n8n Community Edition** — self-hosted, unlimited workflows
- **WhatsApp Business API** — Meta provides 1,000 free service conversations/month
- **Google Sheets API** — free tier covers this use case

