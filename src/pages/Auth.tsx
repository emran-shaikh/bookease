import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { RoleBasedRedirect } from '@/components/RoleBasedRedirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { SEO } from '@/components/SEO';
import { Loader2, Calendar } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Invalid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');
const nameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(100);

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [showTestAccounts, setShowTestAccounts] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const { toast } = useToast();

  if (user) {
    return <RoleBasedRedirect />;
  }

  const quickLogin = (testEmail: string) => {
    setEmail(testEmail);
    setPassword('password123');
  };

  const validateEmail = (email: string) => {
    try {
      emailSchema.parse(email);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { valid: false, error: error.errors[0].message };
      }
      return { valid: false, error: 'Invalid email' };
    }
  };

  const validatePassword = (password: string) => {
    try {
      passwordSchema.parse(password);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { valid: false, error: error.errors[0].message };
      }
      return { valid: false, error: 'Invalid password' };
    }
  };

  const validateName = (name: string) => {
    try {
      nameSchema.parse(name);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { valid: false, error: error.errors[0].message };
      }
      return { valid: false, error: 'Invalid name' };
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      toast({ title: 'Validation Error', description: emailValidation.error, variant: 'destructive' });
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      toast({ title: 'Validation Error', description: passwordValidation.error, variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Error signing in',
        description: error.message || 'Please check your credentials and try again.',
        variant: 'destructive',
      });
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const nameValidation = validateName(fullName);
    if (!nameValidation.valid) {
      toast({ title: 'Validation Error', description: nameValidation.error, variant: 'destructive' });
      return;
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      toast({ title: 'Validation Error', description: emailValidation.error, variant: 'destructive' });
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      toast({ title: 'Validation Error', description: passwordValidation.error, variant: 'destructive' });
      return;
    }

    if (!phone.trim()) {
      toast({ title: 'Validation Error', description: 'Mobile number is required', variant: 'destructive' });
      return;
    }

    if (!city.trim()) {
      toast({ title: 'Validation Error', description: 'City is required', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(email, password, fullName, phone, city);
    setIsLoading(false);

    if (error) {
      if (error.message?.includes('already registered')) {
        toast({
          title: 'Account already exists',
          description: 'This email is already registered. Please sign in instead.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error creating account',
          description: error.message || 'Please try again.',
          variant: 'destructive',
        });
      }
    } else {
      toast({
        title: 'Account created!',
        description: 'Welcome to BookedHours. Redirecting...',
      });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 px-4 py-4 sm:py-6 md:py-8">
      <SEO 
        title="Sign In or Create Account"
        description="Sign in to BookedHours to book sports courts, manage your reservations, and save your favorite venues. Create a free account today."
        keywords="sign in, login, register, create account, sports booking"
      />
      <div className="w-full max-w-4xl space-y-3 sm:space-y-4">
        {/* Test Accounts Info */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="p-3 sm:p-4 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-sm sm:text-base md:text-lg">🧪 Test Accounts</CardTitle>
                <CardDescription className="mt-0.5 sm:mt-1 text-xs sm:text-sm">
                  Quick login for testing
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 flex-shrink-0"
                onClick={() => setShowTestAccounts(!showTestAccounts)}
              >
                {showTestAccounts ? 'Hide' : 'Show'}
              </Button>
            </div>
          </CardHeader>
          {showTestAccounts && (
            <CardContent className="space-y-2 sm:space-y-3 p-3 sm:p-4 md:p-6 pt-0">
              <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-3">
                <div className="rounded-lg border bg-background p-2 sm:p-3">
                  <div className="mb-1 sm:mb-2 text-xs sm:text-sm font-semibold text-primary">👤 Customer</div>
                  <div className="space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs text-muted-foreground">
                    <div>customer@test.com</div>
                    <div>password123</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full h-7 sm:h-8 text-xs"
                    onClick={() => quickLogin('customer@test.com')}
                  >
                    Use
                  </Button>
                </div>
                <div className="rounded-lg border bg-background p-2 sm:p-3">
                  <div className="mb-1 sm:mb-2 text-xs sm:text-sm font-semibold text-primary">🏢 Owner</div>
                  <div className="space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs text-muted-foreground">
                    <div>owner@test.com</div>
                    <div>password123</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full h-7 sm:h-8 text-xs"
                    onClick={() => quickLogin('owner@test.com')}
                  >
                    Use
                  </Button>
                </div>
                <div className="rounded-lg border bg-background p-2 sm:p-3">
                  <div className="mb-1 sm:mb-2 text-xs sm:text-sm font-semibold text-primary">⚡ Admin</div>
                  <div className="space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs text-muted-foreground">
                    <div>admin@test.com</div>
                    <div>password123</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full h-7 sm:h-8 text-xs"
                    onClick={() => quickLogin('admin@test.com')}
                  >
                    Use
                  </Button>
                </div>
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
                💡 Sign up first with these emails to activate roles
              </p>
            </CardContent>
          )}
        </Card>

        <Card className="w-full">
          <CardHeader className="text-center p-4 sm:p-6">
            <div className="mx-auto mb-2 sm:mb-4 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-primary/10">
              <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <CardTitle className="text-xl sm:text-2xl">Welcome to BookedHours</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Book sports venues with ease</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-9 sm:h-10">
                <TabsTrigger value="signin" className="text-xs sm:text-sm">Sign In</TabsTrigger>
                <TabsTrigger value="signup" className="text-xs sm:text-sm">Sign Up</TabsTrigger>
              </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-phone">Mobile Number</Label>
                  <Input
                    id="signup-phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-city">City</Label>
                  <Input
                    id="signup-city"
                    type="text"
                    placeholder="New York"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    At least 6 characters
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>
            </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
