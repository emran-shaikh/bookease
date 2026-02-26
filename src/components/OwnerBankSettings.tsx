import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building, CreditCard, MessageCircle, Save, Webhook } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BankSettings {
  bank_name: string;
  account_title: string;
  account_number: string;
  whatsapp_number: string;
  n8n_webhook_url: string;
}

export function OwnerBankSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BankSettings>({
    bank_name: '',
    account_title: '',
    account_number: '',
    whatsapp_number: '',
    n8n_webhook_url: '',
  });

  useEffect(() => {
    if (user) {
      fetchSettings();
    }
  }, [user]);

  async function fetchSettings() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('bank_name, account_title, account_number, whatsapp_number, n8n_webhook_url')
        .eq('id', user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          bank_name: data.bank_name || '',
          account_title: data.account_title || '',
          account_number: data.account_number || '',
          whatsapp_number: data.whatsapp_number || '',
          n8n_webhook_url: (data as any).n8n_webhook_url || '',
        });
      }
    } catch (error: any) {
      console.error('Error fetching bank settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          bank_name: settings.bank_name || null,
          account_title: settings.account_title || null,
          account_number: settings.account_number || null,
          whatsapp_number: settings.whatsapp_number || null,
          n8n_webhook_url: settings.n8n_webhook_url || null,
        } as any)
        .eq('id', user?.id);

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'Your payment details have been updated successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Settings
        </CardTitle>
        <CardDescription>
          Add your bank details and WhatsApp number. These will be shown to customers when they book your courts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bank_name" className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                Bank Name
              </Label>
              <Input
                id="bank_name"
                placeholder="e.g., Meezan Bank"
                value={settings.bank_name}
                onChange={(e) => setSettings({ ...settings, bank_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account_title">Account Title</Label>
              <Input
                id="account_title"
                placeholder="e.g., FR Sports"
                value={settings.account_title}
                onChange={(e) => setSettings({ ...settings, account_title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account_number">Account Number</Label>
              <Input
                id="account_number"
                placeholder="e.g., 11650112706753"
                value={settings.account_number}
                onChange={(e) => setSettings({ ...settings, account_number: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp_number" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                WhatsApp Number
              </Label>
              <Input
                id="whatsapp_number"
                placeholder="e.g., +92 300 1234567"
                value={settings.whatsapp_number}
                onChange={(e) => setSettings({ ...settings, whatsapp_number: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="n8n_webhook_url" className="flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              n8n Webhook URL (Optional)
            </Label>
            <Input
              id="n8n_webhook_url"
              placeholder="e.g., https://your-n8n.app/webhook/..."
              value={settings.n8n_webhook_url}
              onChange={(e) => setSettings({ ...settings, n8n_webhook_url: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Paste your n8n webhook URL to receive booking notifications via WhatsApp and sync with Google Sheets.
            </p>
          </div>

          <Button type="submit" disabled={saving} className="w-full sm:w-auto">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
