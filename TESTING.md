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
   - Complete payment with Stripe test card: `4242 4242 4242 4242`
   - Any future date for expiry, any 3-digit CVC
6. **View Bookings** - Check your dashboard to see active bookings
7. **Leave a Review** - After booking, go back to the court detail page and submit a review

### As a Court Owner:

1. **Sign up/Login** with `owner@test.com`
2. **View Owner Dashboard** - See all your courts and bookings
3. **Add New Court**:
   - Click "Add New Court" button
   - Fill in court details
   - Set base price
   - Add amenities
   - Submit for admin approval
4. **Manage Bookings** - View all bookings for your courts
5. **View Analytics** - See revenue and booking statistics

### As an Admin:

1. **Sign up/Login** with `admin@test.com`
2. **Access Admin Dashboard** - Approve/reject pending courts
3. **Manage Users** - View all users and their roles
4. **View Analytics** - See system-wide statistics and revenue

## 🔒 Security Features Implemented

- ✅ **Authentication Required** - All payment and booking endpoints require authentication
- ✅ **Input Validation** - All user inputs are validated on both client and server
- ✅ **Server-Side Price Calculation** - Prices are calculated server-side to prevent manipulation
- ✅ **Role-Based Access Control** - Users can only access features appropriate to their role
- ✅ **Row Level Security** - Database policies prevent unauthorized data access
- ✅ **Profiles Privacy** - Users can only view their own profile data (admins can view all)

## 🧪 Stripe Test Cards

For testing payments, use these Stripe test cards:

- **Successful payment**: `4242 4242 4242 4242`
- **Requires authentication**: `4000 0025 0000 3155`
- **Declined card**: `4000 0000 0000 9995`
- Any future expiry date (e.g., 12/34)
- Any 3-digit CVC (e.g., 123)

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
   - Go to court detail page
   - Submit a review with rating and comment
   - View reviews from other users

4. **Admin Functions**
   - Approve/reject new courts
   - View user list with roles
   - See system analytics

## 🐛 Troubleshooting

### Can't see any courts?
- Make sure you're logged in
- Check that you're on the Courts page (/courts)
- Courts are approved and visible to all users

### Payment not working?
- Ensure you're using Stripe test card numbers
- Check browser console for errors
- Verify your session is active

### Role not assigned?
- Log out and log back in
- Check that you used the exact test email addresses
- Roles are assigned automatically on account creation

## 📞 Support

If you encounter any issues, check:
1. Browser console for JavaScript errors
2. Network tab for failed API calls
3. Backend logs in Lovable Cloud dashboard
