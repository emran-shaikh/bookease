import { vi } from 'vitest';

// Mock user data
export const mockCustomer = {
  id: 'customer-123',
  email: 'customer@test.com',
  user_metadata: { full_name: 'Test Customer' },
};

export const mockOwner = {
  id: 'owner-123',
  email: 'owner@test.com',
  user_metadata: { full_name: 'Test Owner' },
};

export const mockAdmin = {
  id: 'admin-123',
  email: 'admin@test.com',
  user_metadata: { full_name: 'Test Admin' },
};

// Mock court data
export const mockCourt = {
  id: 'court-123',
  name: 'Test Tennis Court',
  slug: 'test-tennis-court',
  sport_type: 'tennis',
  base_price: 50,
  city: 'Karachi',
  state: 'Sindh',
  address: '123 Test Street',
  location: 'Test Location',
  zip_code: '75000',
  description: 'A test court for testing',
  amenities: ['Parking', 'WiFi'],
  images: [],
  opening_time: '06:00',
  closing_time: '22:00',
  status: 'approved',
  is_active: true,
  owner_id: 'owner-123',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock booking data
export const mockBooking = {
  id: 'booking-123',
  court_id: 'court-123',
  user_id: 'customer-123',
  booking_date: '2025-12-20',
  start_time: '10:00',
  end_time: '11:00',
  total_price: 50,
  status: 'pending',
  payment_status: 'pending',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock profile data
export const mockProfile = {
  id: 'customer-123',
  email: 'customer@test.com',
  full_name: 'Test Customer',
  phone: '+923001234567',
  city: 'Karachi',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Create mock Supabase client
export const createMockSupabaseClient = () => {
  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  return {
    from: mockFrom,
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test-path' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.com/image.jpg' } }),
      }),
    },
  };
};
