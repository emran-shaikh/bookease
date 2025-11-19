import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Clock, Shield } from 'lucide-react';

export default function Index() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/courts');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="container flex h-16 items-center justify-between">
        <div className="flex items-center space-x-2">
          <Calendar className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">CourtBook</span>
        </div>
        <Button asChild>
          <a href="/auth">Get Started</a>
        </Button>
      </header>

      <main className="container">
        <section className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center space-y-8 text-center">
          <div className="space-y-4">
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
              Book Sports Venues
              <br />
              <span className="text-primary">Anytime, Anywhere</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Find and book sports courts near you. From tennis to basketball,
              we've got you covered with real-time availability and instant booking.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Button size="lg" asChild className="text-lg">
              <a href="/courts">Browse Courts</a>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg">
              <a href="/auth">Sign Up Free</a>
            </Button>
          </div>

          <div className="grid gap-8 pt-12 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col items-center space-y-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold">Find Nearby Courts</h3>
              <p className="text-sm text-muted-foreground">
                Discover venues in your area
              </p>
            </div>

            <div className="flex flex-col items-center space-y-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold">Real-Time Availability</h3>
              <p className="text-sm text-muted-foreground">
                See instant slot availability
              </p>
            </div>

            <div className="flex flex-col items-center space-y-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold">Easy Booking</h3>
              <p className="text-sm text-muted-foreground">
                Book in just a few clicks
              </p>
            </div>

            <div className="flex flex-col items-center space-y-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold">Secure Payments</h3>
              <p className="text-sm text-muted-foreground">
                Pay safely with Stripe
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
