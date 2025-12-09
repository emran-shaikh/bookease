import { Header } from "@/components/Header";
import Footer from "@/components/Footer";

const TermsConditions = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto prose prose-sm md:prose-base dark:prose-invert">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">Terms & Conditions</h1>
          <p className="text-muted-foreground mb-4">Last updated: {new Date().toLocaleDateString()}</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing and using CourtBooker, you accept and agree to be bound by these Terms and Conditions. 
              If you do not agree to these terms, please do not use our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">2. Services Description</h2>
            <p className="text-muted-foreground">
              CourtBooker is an online platform that allows users to discover, compare, and book sports courts 
              across Pakistan. We act as an intermediary between court owners and customers seeking to book court time.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">3. User Accounts</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>You must provide accurate and complete information when creating an account</li>
              <li>You are responsible for maintaining the security of your account credentials</li>
              <li>You must be at least 18 years old to create an account</li>
              <li>One person may not maintain multiple accounts</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">4. Booking Terms</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>All bookings are subject to availability</li>
              <li>Prices are displayed in Pakistani Rupees (PKR)</li>
              <li>Payment must be completed to confirm a booking</li>
              <li>Users must arrive on time for their booked slot</li>
              <li>Court rules and regulations must be followed during use</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">5. User Conduct</h2>
            <p className="text-muted-foreground mb-3">Users agree not to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Provide false or misleading information</li>
              <li>Use the platform for any unlawful purpose</li>
              <li>Interfere with the proper functioning of the service</li>
              <li>Submit fraudulent bookings or reviews</li>
              <li>Damage or misuse booked facilities</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">6. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              CourtBooker is not liable for any direct, indirect, incidental, or consequential damages arising from 
              your use of our services. We do not guarantee the quality, safety, or legality of the courts listed on our platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">7. Modifications</h2>
            <p className="text-muted-foreground">
              We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting. 
              Continued use of the service after changes constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">8. Governing Law</h2>
            <p className="text-muted-foreground">
              These Terms shall be governed by and construed in accordance with the laws of Pakistan. 
              Any disputes shall be subject to the exclusive jurisdiction of the courts in Karachi, Pakistan.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">9. Contact Information</h2>
            <p className="text-muted-foreground">
              For questions about these Terms, contact us at:<br />
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

export default TermsConditions;
