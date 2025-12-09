import { Header } from "@/components/Header";
import { SEO } from "@/components/SEO";
import Footer from "@/components/Footer";

const RefundPolicy = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO 
        title="Refund Policy"
        description="Understand BookedHours refund and cancellation policy. Learn about our conditions for booking refunds and how to request one."
        keywords="refund policy, cancellation, booking refund, return policy"
      />
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto prose prose-sm md:prose-base dark:prose-invert">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-6">Return/Refund Policy</h1>
          <p className="text-muted-foreground mb-4">Last updated: {new Date().toLocaleDateString()}</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">1. Cancellation Policy</h2>
            <p className="text-muted-foreground mb-3">
              We understand that plans can change. Our cancellation policy is as follows:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>24+ hours before booking:</strong> Full refund (100%)</li>
              <li><strong>12-24 hours before booking:</strong> 50% refund</li>
              <li><strong>Less than 12 hours before booking:</strong> No refund</li>
              <li><strong>No-show:</strong> No refund</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">2. How to Request a Refund</h2>
            <p className="text-muted-foreground mb-3">To request a refund:</p>
            <ol className="list-decimal pl-6 text-muted-foreground space-y-2">
              <li>Log into your BookedHours account</li>
              <li>Go to your Dashboard and find the booking</li>
              <li>Click on "Cancel Booking" button</li>
              <li>Confirm the cancellation</li>
              <li>Refund will be processed automatically based on the timeline above</li>
            </ol>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">3. Refund Processing Time</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong>Online Card Payments (PayFast):</strong> 5-7 business days to reflect in your account</li>
              <li><strong>Bank Transfer:</strong> 7-10 business days for refund processing</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              Please note that the exact timing depends on your bank or payment provider.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">4. Court Owner Cancellations</h2>
            <p className="text-muted-foreground">
              If a court owner cancels your booking due to unforeseen circumstances (maintenance, emergency, etc.), 
              you will receive a full refund regardless of the timing. We will also help you find an alternative 
              court if available.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">5. Weather-Related Cancellations</h2>
            <p className="text-muted-foreground">
              For outdoor courts affected by weather conditions, court owners may offer rescheduling options or 
              partial refunds at their discretion. We encourage users to check weather forecasts before booking 
              outdoor facilities.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">6. Disputes</h2>
            <p className="text-muted-foreground">
              If you believe you are entitled to a refund not covered by this policy, or have any disputes, 
              please contact our support team. We will review each case individually and work towards a fair resolution.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">7. Non-Refundable Situations</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Late arrivals that result in missed booking time</li>
              <li>Failure to follow court rules resulting in booking termination</li>
              <li>Bookings made with incorrect information by the user</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">8. Contact Us</h2>
            <p className="text-muted-foreground">
              For refund inquiries, please contact us:<br />
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

export default RefundPolicy;
