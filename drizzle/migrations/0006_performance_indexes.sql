CREATE INDEX IF NOT EXISTS idx_sheet_sync_logs_integration_started ON public.sheet_sync_logs (integration_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_court_date ON public.bookings (court_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON public.bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_courts_owner ON public.courts (owner_id);
CREATE INDEX IF NOT EXISTS idx_blocked_slots_court_date ON public.blocked_slots (court_id, date);
CREATE INDEX IF NOT EXISTS idx_match_guest_contacts_post ON public.match_guest_contacts (post_id);
CREATE INDEX IF NOT EXISTS idx_match_guest_contacts_created ON public.match_guest_contacts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_posts_owner ON public.match_posts (owner_id);