## Goal
Seed a realistic demo setup with **one new owner account**, **2 venues**, and **6 courts** (mixed sports), ready for immediate testing in discovery, booking, and owner dashboard flows.

## Implementation Plan
1. **Create the new owner identity (login-ready)**
   - Provision a new auth user for the owner (email + temporary password).
   - Ensure the profile record exists with full contact basics (name, phone, city).
   - Assign `court_owner` role in `user_roles` for this user.

2. **Insert owner-scoped venue data (2 venues)**
   - Create two approved, active venues under that owner with complete address/location metadata, images array placeholders, and clear slugs.
   - Use distinct cities/areas so search and city filters can be validated.

3. **Insert mixed-sport court inventory (6 courts total)**
   - Add 3 courts per venue, each linked via `venue_id` and `owner_id`.
   - Use different sports across courts (e.g., padel, tennis, badminton, futsal, basketball, pickleball), varied base prices, and realistic operating times.
   - Mark as `approved` + `is_active=true` so they appear immediately on website pages.

4. **Data quality + consistency checks**
   - Validate slugs are unique and venue/court relationships are correct.
   - Confirm no nulls in critical display fields (name, city, location, sport, base price).
   - Verify role/profile linkage for the new owner is correct.

5. **Functional verification in app behavior**
   - Confirm the new owner can sign in and see both venues + all six courts in owner views.
   - Confirm public discovery pages show the new venues/courts with correct location/sport/price metadata.

## Technical Details
- Use **database data operations** (not schema changes).
- Owner identity + role/profile setup and sample records will be inserted in a deterministic sequence:
  1) auth user → 2) profile → 3) user role → 4) venues → 5) courts.
- Court rows will explicitly include both `owner_id` and `venue_id` to avoid orphaned or cross-owner data.
- All inserted sample records will be tagged via clear names/slugs so they are easy to identify and remove later if needed.