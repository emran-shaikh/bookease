# BookedHours Testing Guide

## 🧪 Test Accounts

The application is now set up with automatic role assignment for test accounts. When you create accounts with these specific emails, they will automatically receive the appropriate roles:

### Available Test Accounts

1. **Admin Account**
   - Email: `admin@test.com`
   - Password: `password123`
   - Access: Full system access, can approve courts, manage users, view analytics

2. **Court Owner Account**
   - Email: `owner@test.com`
   - Password: `password123`
   - Access: Can create and manage courts, view bookings for their courts

3. **Customer Account**
   - Email: `customer@test.com`
   - Password: `password123`
   - Access: Can browse courts, make bookings, write reviews

## 📝 How to Set Up Test Accounts

1. Go to the Auth page (/auth)
2. Click on "Sign Up" tab
3. Create accounts using the emails above with password `password123`
4. The system will automatically assign the correct role based on the email
5. You can now log in and test different user flows

## 🏟️ Sample Data Loaded

The system now includes:

- **5 Courts** across different sports:
  - Sunset Tennis Center (Tennis) - $50/hour
  - Riverside Basketball Arena (Basketball) - $75/hour
  - Pacific Soccer Fields (Soccer) - $100/hour
  - Mountain View Badminton Club (Badminton) - $40/hour
  - Beach Volleyball Courts (Volleyball) - $60/hour

- **Dynamic Pricing Rules**:
  - Peak hours pricing (1.5x multiplier during 5-9 PM on weekdays)
  - Weekend pricing (1.3-1.5x multiplier)
  - Holiday pricing (1.7-2.0x multiplier)

- **Holidays**:
  - Christmas Day (Dec 25) - 2.0x multiplier
  - Independence Day (Jul 4) - 1.8x multiplier
  - Thanksgiving (Nov 28) - 1.7x multiplier

## 🚀 Running Automated Tests

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm run test
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Test Files Structure
```
src/test/
├── setup.ts                    # Test environment setup
├── test-utils.tsx              # Custom render utilities
├── mocks/
│   ├── supabase.ts            # Mock data and Supabase client
│   ├── handlers.ts            # MSW request handlers
│   └── server.ts              # MSW server setup
├── flows/
│   ├── customer-booking.test.ts    # Customer workflow tests
│   ├── owner-flow.test.ts          # Court owner workflow tests
│   └── admin-flow.test.ts          # Admin workflow tests
└── utils/
    └── helpers.test.ts              # Utility function tests
```

## 🚀 Testing the Booking Flow

### As a Customer:

1. **Sign up/Login** with `customer@test.com`
2. **Browse Courts** - View all available courts on the Courts page
3. **Filter Courts** - Use search by sport type, city, or price range
4. **View Court Details** - Click on any court to see full details
5. **Make a Booking**:
   - Select a date
   - Choose a time slot
   - View calculated price (with any pricing rules applied)
   - Upload payment screenshot
   - Wait for owner confirmation
6. **View Bookings** - Check your dashboard to see active bookings
7. **Leave a Review** - After booking is completed, go back to the court detail page and submit a review

### As a Court Owner:

1. **Sign up/Login** with `owner@test.com`
2. **View Owner Dashboard** - See all your courts and bookings
3. **Add New Court**:
   - Click "Add New Court" button
   - Fill in court details
   - Set base price
   - Add amenities
   - Submit for admin approval
4. **Configure Bank Settings** - Add your bank details for receiving payments
5. **Manage Bookings** - View all bookings for your courts
6. **Confirm Payments** - Review payment screenshots and confirm bookings
7. **Block Slots** - Block time slots for maintenance
8. **Set Pricing Rules** - Configure peak/weekend pricing

### As an Admin:

1. **Sign up/Login** with `admin@test.com`
2. **Access Admin Dashboard** - Approve/reject pending courts
3. **Manage Users** - View all users and their roles
4. **Manage Holidays** - Add/edit holiday pricing
5. **View Analytics** - See system-wide statistics and revenue

## 🔒 Security Features Implemented

- ✅ **Authentication Required** - All payment and booking endpoints require authentication
- ✅ **Input Validation** - All user inputs are validated on both client and server
- ✅ **Server-Side Price Calculation** - Prices are calculated server-side to prevent manipulation
- ✅ **Role-Based Access Control** - Users can only access features appropriate to their role
- ✅ **Row Level Security** - Database policies prevent unauthorized data access
- ✅ **Profiles Privacy** - Users can only view their own profile data (admins can view all)
- ✅ **Slot Locking** - Prevents double bookings with 5-minute locks

## 📊 Features to Test

1. **Search & Filtering**
   - Search by court name
   - Filter by sport type
   - Filter by city
   - Filter by price range

2. **Dynamic Pricing**
   - Book during peak hours to see higher prices
   - Book on weekends to see weekend pricing
   - Book on holidays to see special pricing

3. **Reviews System**
   - Create a booking first
   - Wait for confirmation
   - Go to court detail page
   - Submit a review with rating and comment
   - View reviews from other users

4. **Admin Functions**
   - Approve/reject new courts
   - View user list with roles
   - Manage holidays
   - See system analytics

5. **Favorites System**
   - Add courts to favorites
   - View favorites page
   - Remove from favorites

6. **Notifications**
   - Receive booking notifications
   - Receive payment confirmation notifications
   - View notification bell updates

## 🐛 Troubleshooting

### Can't see any courts?
- Make sure you're logged in
- Check that you're on the Courts page (/courts)
- Courts are approved and visible to all users

### Payment not working?
- Ensure you upload a valid image file
- Check file size is under 5MB
- Verify your session is active

### Role not assigned?
- Log out and log back in
- Check that you used the exact test email addresses
- Roles are assigned automatically on account creation

### Blank screen after login?
- Clear browser cache
- Check browser console for errors
- Verify environment variables are set correctly

## 📞 Support

If you encounter any issues, check:
1. Browser console for JavaScript errors
2. Network tab for failed API calls
3. Backend logs in Lovable Cloud dashboard
