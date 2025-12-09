import { Header } from "@/components/Header";
import Footer from "@/components/Footer";

const ServicePolicy = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto prose prose-sm md:prose-base dark:prose-invert">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">Service Policy</h1>
          <p className="text-muted-foreground mb-4">Last updated: {new Date().toLocaleDateString()}</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">1. Service Overview</h2>
            <p className="text-muted-foreground">
              BookedHours provides an online platform connecting sports enthusiasts with court facilities across Pakistan. 
              Our service includes court discovery, real-time availability checking, online booking, secure payment processing, 
              and booking management.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">2. Booking Process</h2>
            <ol className="list-decimal pl-6 text-muted-foreground space-y-2">
              <li>Browse available courts by location, sport type, or date</li>
              <li>Select your preferred date and time slot(s)</li>
              <li>Review pricing and any applicable peak-hour charges</li>
              <li>Complete payment via PayFast or Bank Transfer</li>
              <li>Receive booking confirmation via email and in-app notification</li>
              <li>Arrive at the court on time with your booking confirmation</li>
            </ol>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">3. Payment Methods</h2>
            <p className="text-muted-foreground mb-3">We accept the following payment methods:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>PayFast:</strong> Online debit/credit card payments (Visa, Mastercard)</li>
              <li><strong>Bank Transfer:</strong> Direct bank transfer (booking confirmed after payment verification)</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              All prices are displayed and charged in Pakistani Rupees (PKR).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">4. Service Hours</h2>
            <p className="text-muted-foreground">
              Our online platform is available 24/7 for browsing and booking. Customer support is available:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-3">
              <li><strong>Monday - Saturday:</strong> 9:00 AM - 9:00 PM PKT</li>
              <li><strong>Sunday:</strong> 10:00 AM - 6:00 PM PKT</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">5. User Responsibilities</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Provide accurate personal and contact information</li>
              <li>Arrive at the booked court on time</li>
              <li>Carry valid ID and booking confirmation</li>
              <li>Follow court rules and regulations</li>
              <li>Treat facilities and equipment with care</li>
              <li>Respect other users and court staff</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">6. Court Owner Responsibilities</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Maintain accurate court information and availability</li>
              <li>Ensure facilities are clean, safe, and as described</li>
              <li>Honor all confirmed bookings</li>
              <li>Provide necessary equipment as advertised</li>
              <li>Communicate any changes or issues promptly</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">7. Quality Assurance</h2>
            <p className="text-muted-foreground">
              We strive to maintain high service standards. All court listings undergo an approval process before 
              being published. We encourage users to submit reviews after their bookings to help maintain quality 
              and assist other users in making informed decisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">8. Complaint Resolution</h2>
            <p className="text-muted-foreground mb-3">
              If you experience any issues with our service or a booked facility:
            </p>
            <ol className="list-decimal pl-6 text-muted-foreground space-y-2">
              <li>Contact our support team within 24 hours of the incident</li>
              <li>Provide booking details and description of the issue</li>
              <li>Include photos or evidence if applicable</li>
              <li>Our team will investigate and respond within 48 hours</li>
            </ol>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">9. Service Modifications</h2>
            <p className="text-muted-foreground">
              We reserve the right to modify, suspend, or discontinue any part of our service at any time. 
              We will provide reasonable notice for any significant changes that may affect existing bookings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">10. Contact Information</h2>
            <p className="text-muted-foreground">
              For service-related inquiries, please contact us:<br />
              <strong>Address:</strong> F-52, 1ST FLOOR, ZAIN MOBILE MALL, Tariq Rd, Karachi<br />
              <strong>Phone:</strong> +92 347 2751351
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ServicePolicy;
