import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
}

export function SEO({ 
  title, 
  description, 
  keywords,
  canonical,
  ogImage = 'https://bookedhours.com/og-image.png',
  ogType = 'website'
}: SEOProps) {
  const fullTitle = title.includes('BookedHours') ? title : `${title} | BookedHours`;
  
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "BookedHours",
    "description": "Online indoor sports court booking platform in Karachi. Book cricket, futsal, badminton, tennis courts instantly.",
    "url": "https://bookedhours.com",
    "telephone": "+92 347 2751351",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "F-52, 1ST FLOOR, ZAIN MOBILE MALL, Tariq Rd",
      "addressLocality": "Karachi",
      "addressCountry": "PK"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": "24.8607",
      "longitude": "67.0011"
    },
    "openingHoursSpecification": {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      "opens": "06:00",
      "closes": "23:00"
    },
    "priceRange": "PKR",
    "areaServed": "Karachi",
    "serviceType": ["Indoor Cricket Court Booking", "Futsal Ground Booking", "Badminton Court Booking", "Tennis Court Booking", "Sports Hall Rental"]
  };

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      {canonical && <link rel="canonical" href={canonical} />}
      
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={ogImage} />
      {canonical && <meta property="og:url" content={canonical} />}
      
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
    </Helmet>
  );
}
