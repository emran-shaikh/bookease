import { http, HttpResponse } from 'msw';
import { mockCourt, mockBooking, mockProfile } from './supabase';

const SUPABASE_URL = 'https://uhmtrnmsrbeaizjxoily.supabase.co';

export const handlers = [
  // Courts endpoints
  http.get(`${SUPABASE_URL}/rest/v1/courts`, () => {
    return HttpResponse.json([mockCourt]);
  }),

  http.get(`${SUPABASE_URL}/rest/v1/courts*`, ({ request }) => {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');
    if (slug) {
      return HttpResponse.json([mockCourt]);
    }
    return HttpResponse.json([mockCourt]);
  }),

  // Bookings endpoints
  http.get(`${SUPABASE_URL}/rest/v1/bookings`, () => {
    return HttpResponse.json([mockBooking]);
  }),

  http.post(`${SUPABASE_URL}/rest/v1/bookings`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockBooking, ...body }, { status: 201 });
  }),

  http.patch(`${SUPABASE_URL}/rest/v1/bookings*`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockBooking, ...body });
  }),

  // Profiles endpoints
  http.get(`${SUPABASE_URL}/rest/v1/profiles*`, () => {
    return HttpResponse.json([mockProfile]);
  }),

  http.patch(`${SUPABASE_URL}/rest/v1/profiles*`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockProfile, ...body });
  }),

  // User roles endpoints
  http.get(`${SUPABASE_URL}/rest/v1/user_roles*`, () => {
    return HttpResponse.json([{ id: '1', user_id: 'customer-123', role: 'customer' }]);
  }),

  // Slot locks endpoints
  http.get(`${SUPABASE_URL}/rest/v1/slot_locks*`, () => {
    return HttpResponse.json([]);
  }),

  http.post(`${SUPABASE_URL}/rest/v1/slot_locks`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ id: 'lock-123', ...body }, { status: 201 });
  }),

  http.delete(`${SUPABASE_URL}/rest/v1/slot_locks*`, () => {
    return HttpResponse.json({});
  }),

  // Blocked slots endpoints
  http.get(`${SUPABASE_URL}/rest/v1/blocked_slots*`, () => {
    return HttpResponse.json([]);
  }),

  // Pricing rules endpoints
  http.get(`${SUPABASE_URL}/rest/v1/pricing_rules*`, () => {
    return HttpResponse.json([]);
  }),

  // Holidays endpoints
  http.get(`${SUPABASE_URL}/rest/v1/holidays*`, () => {
    return HttpResponse.json([]);
  }),

  // Reviews endpoints
  http.get(`${SUPABASE_URL}/rest/v1/reviews*`, () => {
    return HttpResponse.json([]);
  }),

  // Favorites endpoints
  http.get(`${SUPABASE_URL}/rest/v1/favorites*`, () => {
    return HttpResponse.json([]);
  }),

  // Notifications endpoints
  http.get(`${SUPABASE_URL}/rest/v1/notifications*`, () => {
    return HttpResponse.json([]);
  }),

  // Edge functions
  http.post(`${SUPABASE_URL}/functions/v1/calculate-price`, () => {
    return HttpResponse.json({ price: 50, breakdown: { base: 50 } });
  }),

  http.post(`${SUPABASE_URL}/functions/v1/send-booking-confirmation`, () => {
    return HttpResponse.json({ success: true });
  }),
];
