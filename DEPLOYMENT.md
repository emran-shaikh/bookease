# BookedHours Production Deployment Guide

## Prerequisites

Before deploying to production, ensure you have:

1. **Node.js 18+** installed
2. **npm** or **bun** package manager
3. **Git** (optional, for version control)

---

## Step 1: Environment Variables

Create a `.env.production` file with the following variables:

```env
VITE_SUPABASE_URL=https://uhmtrnmsrbeaizjxoily.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVobXRybm1zcmJlYWl6anhvaWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MjI2OTAsImV4cCI6MjA3OTA5ODY5MH0.tRF7HKx8kI95nDq_qbW1Tk_HWBBdN5KFLinXILAiCkA
VITE_SUPABASE_PROJECT_ID=uhmtrnmsrbeaizjxoily
```

---

## Step 2: Build the Project

### Option A: Using npm

```bash
# Install dependencies
npm install

# Run tests (optional but recommended)
npm run test

# Build for production
npm run build
```

### Option B: Using bun

```bash
# Install dependencies
bun install

# Run tests (optional but recommended)
bun run test

# Build for production
bun run build
```

The build output will be in the `dist/` folder.

---

## Step 3: Test the Build Locally

```bash
# Install a static server if needed
npm install -g serve

# Serve the build
serve -s dist -l 3000
```

Visit `http://localhost:3000` to verify the build works correctly.

---

## Step 4: Deploy to Your Hosting

### Static File Hosting (Recommended)

The `dist/` folder contains static files that can be deployed to any static hosting provider:

#### Netlify
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
```

#### Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

#### Traditional Hosting (cPanel, DirectAdmin, etc.)

1. Upload the contents of the `dist/` folder to your `public_html` directory
2. Ensure the `.htaccess` file is configured for SPA routing (see below)

---

## Step 5: Configure Server for SPA Routing

Since BookedHours is a Single Page Application (SPA), you need to configure your server to redirect all routes to `index.html`.

### Apache (.htaccess)

Create or update `.htaccess` in your web root:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

# Caching for static assets
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType font/woff2 "access plus 1 year"
</IfModule>

# Security headers
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set X-XSS-Protection "1; mode=block"
</IfModule>
```

### Nginx

Add to your nginx config:

```nginx
server {
    listen 80;
    server_name bookedhours.com www.bookedhours.com;
    root /var/www/bookedhours/dist;
    index index.html;

    # SPA routing - redirect all requests to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
}
```

---

## Step 6: Configure Google OAuth (Production)

Update your Google Cloud Console OAuth settings:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services > Credentials**
3. Edit your OAuth 2.0 Client ID
4. Add to **Authorized redirect URIs**:
   - `https://bookedhours.com/auth/callback`
   - `https://www.bookedhours.com/auth/callback`
   - `https://uhmtrnmsrbeaizjxoily.supabase.co/auth/v1/callback`

---

## Step 7: Post-Deployment Checklist

### Test All User Flows

#### Customer Flow
- [ ] Sign up with email/password
- [ ] Sign in with existing account
- [ ] Sign in with Google
- [ ] Browse courts list
- [ ] View court details
- [ ] Select date and time slots
- [ ] Complete booking with payment screenshot
- [ ] View bookings in dashboard
- [ ] Add court to favorites
- [ ] Leave a review

#### Owner Flow
- [ ] Sign up as court owner
- [ ] Add new court
- [ ] View pending court approval status
- [ ] Configure bank details
- [ ] View bookings for owned courts
- [ ] Confirm pending payments
- [ ] Block slots for maintenance
- [ ] Set pricing rules

#### Admin Flow
- [ ] Access admin dashboard
- [ ] Approve/reject pending courts
- [ ] View all users
- [ ] View all bookings
- [ ] Manage holidays
- [ ] View analytics

### Performance Checks
- [ ] Test page load speed (<3 seconds)
- [ ] Verify images are loading
- [ ] Check mobile responsiveness
- [ ] Test on different browsers

### Security Checks
- [ ] Verify HTTPS is working
- [ ] Check authentication is required for protected routes
- [ ] Verify RLS policies are enforced
- [ ] Test that users can only access their own data

---

## Troubleshooting

### Blank Screen After Deploy

1. Check browser console for errors
2. Verify environment variables are set
3. Ensure SPA routing is configured
4. Clear browser cache

### API Errors

1. Verify Supabase URL and key are correct
2. Check if backend functions are deployed
3. Review RLS policies if data access issues

### Authentication Issues

1. Verify redirect URLs in Google Console
2. Check that auto-confirm is enabled in auth settings
3. Verify callback route (`/auth/callback`) is accessible

### Images Not Loading

1. Check if images are in the `dist/assets` folder
2. Verify paths are correct (relative vs absolute)
3. Check CORS settings if using external images

---

## Running Tests

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

---

## Support

For issues or questions:
- Email: support@bookedhours.com
- WhatsApp: +92 347 2751351
- Office: F-52, 1ST FLOOR, ZAIN MOBILE MALL, Tariq Rd, Karachi

---

## Quick Deploy Commands

```bash
# Full production build workflow
npm install && npm run build

# The dist/ folder is ready for deployment
```
