## Goal
Add a **public “Need Players” module** on top of bookings so a user can open slots for a booked court, others can **join instantly**, and the system stays reliable for real-life play.

## What we’ll build

### 1) Core module: “Open Match” linked to a booking
- Host books a court as usual.
- Host can enable **Need Players** and set required players (e.g., 2–5).
- This creates a public match post tied to the booking (court, venue, date/time).
- Match post auto-closes when full, booking is canceled, or start time passes.

### 2) Public instant-join flow (no approval queue)
- Discovery feed shows active open matches.
- Player taps **Join** → immediate confirmation if seat available.
- Last seat is protected by atomic server logic (no double-book race).
- If full, user gets immediate “already full” response.

### 3) Smart filtered discovery
- Feed ranked/filtered by:
  - city/location proximity
  - sport compatibility
  - skill range compatibility
  - date/time window relevance
- Hide irrelevant/expired/full/canceled matches.
- Optional “For You” sort first, manual filters second.

### 4) Soft no-show policy
- No money penalty in v1.
- Track attendance/reliability score:
  - join → attended = positive
  - join → no-show/late-cancel = warning + score reduction
- Repeat low reliability can reduce ranking priority in discovery.

### 5) Real-life reliability integration
- Pre-game reminders (in-app + WhatsApp/push if enabled).
- Join cutoff (e.g., 15–30 min before start) to stabilize final roster.
- Host roster view with participant status and quick contact actions.
- Post-game attendance confirmation prompt for host and participants.

### 6) Owner / venue / court safety and sync alignment
- Match post must always inherit exact `booking_id`, `court_id`, `venue_id`, and owner scope.
- If booking changes from sheet sync/cancel-replace/conflict handling:
  - linked match post updates immediately or closes
  - participants notified immediately
- No cross-owner or cross-court side effects.

## Technical details

### Data model (new module tables)
- `match_posts`
  - booking link, host, venue/court, schedule snapshot, needed slots, joined count, status
  - discovery attributes (sport, city, skill_band)
- `match_participants`
  - post_id, user_id, joined_at, status (joined/canceled/attended/no_show)
- `player_reliability`
  - user_id, score, no_show_count, late_cancel_count, last_event_at
- Optional `match_events` (audit timeline)

### Access control
- Public read for active discovery-safe fields only.
- Authenticated users required to join/cancel.
- Host can manage own post; owners/admins can moderate where needed.
- Strict RLS by user ownership + booking linkage.

### Concurrency/performance
- Use one atomic backend operation for join (single transaction path).
- Capacity check and insert in same critical section.
- Indexes on active status + datetime + venue/court + sport/city.
- Realtime updates for seat count and closure.

### Integration points
- Booking lifecycle hooks/events update match post state.
- Existing notifications/reminder pipelines reused.
- Existing sheet-sync pipeline updates linked match posts via `booking_id`.

## Rollout plan
1. **Phase 1 (MVP):** create/open match, public feed, instant join, auto-close, basic notifications.
2. **Phase 2:** smart ranking, reliability scoring, attendance confirmation UX.
3. **Phase 3:** stronger trust features (optional profile verification, advanced moderation).

## Success metrics
- Match fill rate (% of open posts that reach full roster)
- Time-to-fill per sport/city
- No-show rate trend
- Rebooking/repeat play rate
- Cancellation due to low participation

If you approve this plan, I’ll implement Phase 1 first with production-safe owner/court scoping and race-safe instant joins.