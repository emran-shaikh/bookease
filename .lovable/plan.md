
1) Define the sync contract (owner-facing + system rules)
- Make Google Sheets a first-class “operations console” for owners, with true two-way behavior:
  - Website changes push to sheet automatically.
  - Sheet edits pull to website automatically in background.
- Apply your chosen conflict policy:
  - **Most recent wins**
  - **Automatic + instant** (implemented as immediate push from site + frequent background pull from sheet)
  - **Allow new rows from sheet**
  - **Deleted row in sheet => cancel booking on website**
- Standardize the sheet schema so sync is deterministic (no ambiguous columns).

2) Database upgrades for reliable bidirectional sync
- Create a migration to add sync metadata and mapping state:
  - `bookings`:
    - `source_updated_at timestamptz` (last authoritative change time for conflict resolution)
    - `source_updated_by text` (`site` | `sheet`)
  - `sheet_integrations`:
    - `auto_sync_enabled boolean default true`
    - `last_pull_at timestamptz`
    - `last_push_at timestamptz`
    - `sync_cursor text` (optional incremental token)
  - New table `sheet_booking_links` (integration-scoped mapping):
    - `integration_id`, `booking_id`, `sheet_row_key` (stable row identifier), `last_seen_at`, `row_hash`, `is_deleted`
- Add indexes for fast reconciliation (`integration_id`, `booking_id`, `sheet_row_key`).
- Keep existing RLS model; service-role edge functions continue controlled writes.

3) Refactor sync engine in `supabase/functions/sync-sheet/index.ts`
- Move from “rebuild sheet every time” to **incremental reconcile**:
  - **Push path (site -> sheet)**: only changed bookings since `last_push_at`.
  - **Pull path (sheet -> site)**: parse current rows, compare against link table + hashes.
- Enforce deterministic row identity:
  - Use full booking UUID in a dedicated hidden/locked column (not just 8-char prefix).
  - Keep short booking ID as display-only.
- Implement row-level actions during pull:
  - Existing row changed -> compare timestamps and apply **most recent wins**.
  - Unknown row with required fields -> create new booking (with overlap/blocked-slot checks).
  - Missing previously-known row -> set booking status to `cancelled`.
- Add strict validation and normalization:
  - Date/time format parsing, status/payment enum validation, court-name mapping safety, duplicate-row guards.
- Add anti-loop protection:
  - Track `source_updated_by` and sync run id so write-backs don’t cause ping-pong updates.
- Improve error taxonomy:
  - Return actionable errors for API disabled, sharing permissions, invalid tab, malformed row, duplicate/overlap conflict.

4) Automatic sync orchestration (near-real-time behavior)
- Add a scheduled backend function (e.g. `auto-sync-sheets`) that:
  - runs frequently (e.g. every minute),
  - processes active integrations,
  - executes pull reconcile safely with per-integration lock.
- Add immediate push triggers from website mutation points:
  - booking create/cancel/confirm/payment updates invoke sync push event path.
- Keep manual buttons (`To Sheet`, `From Sheet`, `Full Sync`) as fallback and admin recovery tools.

5) Owner dashboard UX improvements (clarity + trust)
- Upgrade `src/components/SheetIntegration.tsx` to show:
  - Clear mode/status (“Connected”, “Auto-sync active”, “Attention needed”)
  - Last push/pull timestamps
  - Rows created/updated/cancelled in last run
  - Conflict count and downloadable error details
- Add “Sync Health” panel:
  - API enabled check
  - sheet access check
  - tab schema check
  - permissions check
- Add an “integration setup checklist” UI for owners:
  - API enabled
  - sheet shared with service account
  - correct tab name
  - required columns present

6) Booking workflow consistency updates
- Ensure all booking mutations (customer booking, owner confirm/cancel, admin changes) update `source_updated_at/source_updated_by`.
- Ensure sheet-originated updates preserve business rules (overlap/blocked slots/valid statuses).
- Prevent silent conflicts by logging every overridden field decision in sync logs.

7) Observability, logs, and recovery
- Expand `sheet_sync_logs` usage to include:
  - run type (`push`, `pull`, `full`, `auto`),
  - counts (created/updated/cancelled/skipped/conflicted),
  - per-row failure snippets.
- Add a lightweight “replay last failed run” endpoint/action.
- Add structured logs in sync function for quick diagnosis.

8) Test plan (before rollout)
- Edge-function tests:
  - site->sheet push, sheet->site update, new row create, row delete->cancel, conflict resolution.
- Integration tests:
  - owner edits sheet while customer books same slot; verify “most recent wins” and no duplicate booking.
- UI tests:
  - setup flow, health checks, error rendering, manual fallback actions.
- Regression tests:
  - booking creation/confirmation/cancellation still works when sync is enabled.

9) Rollout strategy
- Phase 1: deploy schema + refactored sync with manual controls.
- Phase 2: enable auto-sync scheduler for a subset (or all owners with active integrations).
- Phase 3: tighten UX messaging and remove ambiguous legacy copy (“simple mode” wording) so owners clearly understand live bidirectional behavior.

Technical details
- “Automatic + instant” for Google Sheets is implemented as:
  - immediate push on website-side mutations, plus
  - high-frequency background pull for sheet-side edits (Google Sheets doesn’t provide dependable row-level webhooks for this exact flow).
- Conflict engine uses `source_updated_at` timestamps and deterministic row mapping (`sheet_booking_links`) for idempotent reconciliation.
- Deletion handling is snapshot-based: if a previously-linked row disappears from sheet, corresponding booking is cancelled (and logged).
- New row ingestion from sheet requires minimum fields: court, date, start, end; all rows pass overlap and validation checks before insert.
