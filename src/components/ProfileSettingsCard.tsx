import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ProfileSettingsCard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    new_password: '',
    confirm_password: '',
  });

  useEffect(() => {
    async function fetchProfile() {
      if (!user?.id) {
        setLoadingProfile(false);
        return;
      }

      setLoadingProfile(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email, phone')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        toast({
          title: 'Could not load profile',
          description: error.message,
          variant: 'destructive',
        });
      }

      setFormData((prev) => ({
        ...prev,
        full_name: data?.full_name || user.user_metadata?.full_name || '',
        email: data?.email || user.email || '',
        phone: data?.phone || '',
      }));
      setLoadingProfile(false);
    }

    fetchProfile();
  }, [user?.id, user?.email, user?.user_metadata?.full_name, toast]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) return;

    const fullName = formData.full_name.trim();
    const email = formData.email.trim();
    const phone = formData.phone.trim();
    const newPassword = formData.new_password.trim();
    const confirmPassword = formData.confirm_password.trim();

    if (!fullName || !email) {
      toast({
        title: 'Missing information',
        description: 'Name and email are required.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        toast({
          title: 'Invalid password',
          description: 'Password must be at least 6 characters.',
          variant: 'destructive',
        });
        return;
      }

      if (newPassword !== confirmPassword) {
        toast({
          title: 'Password mismatch',
          description: 'New password and confirm password must match.',
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setSaving(true);

      if (email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email });
        if (emailError) throw emailError;
      }

      if (newPassword) {
        const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
        if (passwordError) throw passwordError;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          email,
          phone: phone || null,
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      setFormData((prev) => ({
        ...prev,
        new_password: '',
        confirm_password: '',
      }));

      toast({
        title: 'Profile updated',
        description: email !== user.email
          ? 'Your profile is updated. Check your inbox to confirm the new email if required.'
          : 'Your account information has been saved.',
      });
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>Update your name, email, phone number, and password.</CardDescription>
      </CardHeader>
      <CardContent>
        {loadingProfile ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-full-name">Full Name</Label>
              <Input
                id="profile-full-name"
                value={formData.full_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder="Your full name"
                maxLength={100}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="you@example.com"
                maxLength={255}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="03XXXXXXXXX"
                maxLength={20}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-new-password">New Password</Label>
                <Input
                  id="profile-new-password"
                  type="password"
                  value={formData.new_password}
                  onChange={(e) => setFormData((prev) => ({ ...prev, new_password: e.target.value }))}
                  placeholder="Leave blank to keep current"
                  minLength={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-confirm-password">Confirm Password</Label>
                <Input
                  id="profile-confirm-password"
                  type="password"
                  value={formData.confirm_password}
                  onChange={(e) => setFormData((prev) => ({ ...prev, confirm_password: e.target.value }))}
                  placeholder="Confirm new password"
                  minLength={6}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
