# Plan: Make the app stand out from competitors

## Objective
Turn the product into the **most trusted and easiest way** to book courts and find players, with visible advantages users feel in their first 2 minutes.

## What to build next (priority order)

### 1) Trust Layer (highest impact)
- Add a **Verified Player** profile badge (phone + attendance history + low no-show risk).
- Add **Reliability Score visibility** on match cards before joining.
- Add **Host trust controls**: minimum score required, skill preference, age/gender preference (optional).
- Add a lightweight **post-match feedback** flow that updates reliability.

### 2) Social Match Discovery 2.0
- Add **“Near me now”** and **“Starting in next 2 hours”** match filters.
- Add **1-tap share card** for WhatsApp with join link + slot details.
- Add **waitlist + auto-fill** when someone leaves/cancels.
- Add **teammate memory**: “people you played with recently” quick invite.

### 3) Booking Intelligence (owner + player wow factor)
- Add a **Smart Slot Suggestions** panel (best available times by sport + demand).
- Add **dynamic nudges** (“Only 1 spot left”, “peak slots filling fast”).
- Add **alternative venue suggestions** when preferred court is full.
- Add **instant rebook** from past bookings.

### 4) Owner Growth Toolkit
- Add **owner mini-CRM**: repeat players, inactive players, frequent cancellations.
- Add **campaigns**: off-peak promos, private invite links, referral rewards.
- Add **conversion dashboard**: views → join requests → confirmed matches/bookings.
- Add **auto reminders** and **follow-up templates** (WhatsApp/email).

### 5) Premium User Experience polish
- Add **Live activity strip** on home (“matches starting soon”, “new join requests”).
- Add **frictionless guest-to-user upgrade** after first join.
- Add **one-screen “Tonight to Play”** mode for quick booking/join decisions.
- Add stronger **empty states** with contextual actions (not just static text).

## Release strategy

### Phase A (2 weeks) — “Trust + Fast Join”
- Reliability score visibility
- Near-time filters
- Waitlist auto-fill
- WhatsApp share card

### Phase B (2–3 weeks) — “Smart Booking”
- Smart slot suggestions
- Alternative venue recommendations
- Instant rebook

### Phase C (2 weeks) — “Owner Growth”
- Owner mini-CRM
- Campaign tools
- Conversion funnel analytics

## Success metrics (must track)
- Join request to accepted join rate
- Match fill rate before start time
- Repeat booking rate (7/30 day)
- No-show/cancellation rate
- Owner weekly active usage
- Time-to-book and time-to-join

## Technical implementation notes
- Keep all trust/reliability decisions backend-enforced (not client-calculated).
- Add denormalized counters for match cards (joined, pending, acceptance rate) to keep UI fast.
- Use realtime updates for host panels, join status, and waitlist promotions.
- Add abuse controls for invites/shares (per-user rate limits and event logging).
- Keep all new notifications owner-scoped and role-safe with strict access policies.

## Decision needed before implementation
Pick one focus for the next sprint:
1. **Growth first** (owner toolkit + referrals)
2. **Community first** (match discovery + waitlist + teammate memory)
3. **Trust first** (verified profiles + reliability + host controls)