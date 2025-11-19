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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Animated background elements */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 -left-4 h-72 w-72 animate-pulse rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 animate-pulse rounded-full bg-secondary/10 blur-3xl delay-1000" />
      </div>

      <header className="container flex h-20 items-center justify-between backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Calendar className="h-6 w-6 text-primary" />
          </div>
          <span className="text-2xl font-bold tracking-tight">CourtBook</span>
        </div>
        <Button size="lg" asChild className="shadow-lg hover:shadow-xl transition-all duration-300">
          <a href="/auth">Get Started</a>
        </Button>
      </header>

      <main className="container">
        <section className="flex min-h-[calc(100vh-5rem)] flex-col items-center justify-center space-y-12 text-center py-12">
          <div className="space-y-6 animate-fade-in">
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
              Book Sports Venues
              <br />
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Anytime, Anywhere
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl md:text-2xl leading-relaxed">
              Find and book sports courts near you. From tennis to basketball,
              we've got you covered with real-time availability and instant booking.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row animate-fade-in">
            <Button size="lg" asChild className="text-lg px-8 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
              <a href="/courts">Browse Courts</a>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg px-8 border-2 hover:bg-primary/5 transition-all duration-300 hover:scale-105">
              <a href="/auth">Sign Up Free</a>
            </Button>
          </div>

          <div className="grid gap-8 pt-16 sm:grid-cols-2 lg:grid-cols-4 w-full max-w-6xl">
            <div className="group flex flex-col items-center space-y-3 text-center p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
                <MapPin className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Find Nearby Courts</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Discover top-rated venues in your area with detailed information and reviews
              </p>
            </div>

            <div className="group flex flex-col items-center space-y-3 text-center p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Real-Time Availability</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Check live slot availability and never miss your perfect time
              </p>
            </div>

            <div className="group flex flex-col items-center space-y-3 text-center p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
                <Calendar className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Easy Booking</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Book your favorite court in just a few clicks with our simple interface
              </p>
            </div>

            <div className="group flex flex-col items-center space-y-3 text-center p-6 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:from-primary/30 group-hover:to-primary/10 transition-all duration-300">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">Secure Payments</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pay securely with industry-standard encryption powered by Stripe
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
