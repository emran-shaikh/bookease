import { Header } from "@/components/Header";
import { SEO } from "@/components/SEO";
import Footer from "@/components/Footer";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO 
        title="Privacy Policy"
        description="Learn how BookedHours collects, uses, and protects your personal information. Your privacy is important to us."
        keywords="privacy policy, data protection, personal information, BookedHours"
      />
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto prose prose-sm md:prose-base dark:prose-invert">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">Privacy Policy</h1>
          <p className="text-muted-foreground mb-4">Last updated: {new Date().toLocaleDateString()}</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">1. Information We Collect</h2>
            <p className="text-muted-foreground mb-3">We collect information you provide directly to us, such as:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Name, email address, and phone number when you create an account</li>
              <li>Payment information when you make a booking</li>
              <li>Location data to show nearby courts</li>
              <li>Booking history and preferences</li>
              <li>Communications with our support team</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">2. How We Use Your Information</h2>
            <p className="text-muted-foreground mb-3">We use the information we collect to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Process your bookings and payments</li>
              <li>Send booking confirmations and reminders</li>
              <li>Provide customer support</li>
              <li>Improve our services</li>
              <li>Send promotional communications (with your consent)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">3. Information Sharing</h2>
            <p className="text-muted-foreground">
              We do not sell your personal information. We may share your information with court owners to facilitate bookings, 
              payment processors to complete transactions, and service providers who assist in our operations.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">4. Data Security</h2>
            <p className="text-muted-foreground">
              We implement appropriate security measures to protect your personal information against unauthorized access, 
              alteration, disclosure, or destruction. All payment information is encrypted and processed securely through PayFast.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">5. Your Rights</h2>
            <p className="text-muted-foreground mb-3">You have the right to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Opt-out of marketing communications</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">6. Contact Us</h2>
            <p className="text-muted-foreground">
              If you have any questions about this Privacy Policy, please contact us at:<br />
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

export default PrivacyPolicy;
