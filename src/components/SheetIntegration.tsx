import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileSpreadsheet, RefreshCw, Trash2, ExternalLink, CheckCircle, XCircle, Clock, ArrowUpDown, ArrowDown, ArrowUp } from 'lucide-react';
import { format } from 'date-fns';

interface SheetIntegration {
  id: string;
  owner_id: string;
  sheet_url: string;
  sheet_id: string | null;
  platform: string;
  sheet_name: string;
  is_active: boolean;
  last_synced_at: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: string;
}

export function SheetIntegrationPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<SheetIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    sheet_url: '',
    platform: 'google_sheets',
    sheet_name: 'Bookings',
  });

  useEffect(() => {
    if (user) fetchIntegrations();
  }, [user]);

  async function fetchIntegrations() {
    const { data, error } = await supabase
      .from('sheet_integrations')
      .select('*')
      .eq('owner_id', user?.id)
      .order('created_at', { ascending: false });

    if (!error) setIntegrations((data as any[]) || []);
    setLoading(false);
  }

  async function handleAddIntegration(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.sheet_url) {
      toast({ title: 'Error', description: 'Please enter a sheet URL', variant: 'destructive' });
      return;
    }

    // Validate URL based on platform
    if (formData.platform === 'google_sheets' && !formData.sheet_url.includes('docs.google.com/spreadsheets')) {
      toast({ title: 'Invalid URL', description: 'Please enter a valid Google Sheets URL', variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase.from('sheet_integrations').insert({
        owner_id: user?.id,
        sheet_url: formData.sheet_url,
        platform: formData.platform,
        sheet_name: formData.sheet_name || 'Bookings',
      } as any);

      if (error) throw error;

      toast({
        title: 'Success',
        description: formData.platform === 'google_sheets'
          ? 'Sheet linked! If using simple mode, use "From Sheet" to import changes.'
          : 'Sheet linked! Click "Initialize" to set up the sheet with your booking data.',
      });
      setShowAddForm(false);
      setFormData({ sheet_url: '', platform: 'google_sheets', sheet_name: 'Bookings' });
      fetchIntegrations();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  async function handleSync(integrationId: string, action: string) {
    setSyncing(integrationId);
    try {
      const { data, error } = await supabase.functions.invoke('sync-sheet', {
        body: {
          action,
          integration_id: integrationId,
          owner_id: user?.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Sync Complete', description: data.message });
      fetchIntegrations();
    } catch (error: any) {
      toast({ title: 'Sync Failed', description: error.message, variant: 'destructive' });
      fetchIntegrations();
    } finally {
      setSyncing(null);
    }
  }

  async function handleDelete(integrationId: string) {
    if (!confirm('Remove this sheet integration? Your sheet data will not be deleted.')) return;

    try {
      const { error } = await supabase.from('sheet_integrations').delete().eq('id', integrationId);
      if (error) throw error;
      toast({ title: 'Removed', description: 'Sheet integration removed' });
      fetchIntegrations();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'syncing': return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getSyncStatusBadge = (status: string) => {
    switch (status) {
      case 'success': return <Badge variant="default">Synced</Badge>;
      case 'error': return <Badge variant="destructive">Error</Badge>;
      case 'syncing': return <Badge variant="secondary">Syncing...</Badge>;
      default: return <Badge variant="outline">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Spreadsheet Integration
          </h3>
          <p className="text-sm text-muted-foreground">
            Link your Google Sheets or Excel Online to sync bookings bidirectionally
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} variant={showAddForm ? 'outline' : 'default'}>
          {showAddForm ? 'Cancel' : '+ Link Sheet'}
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Link a Spreadsheet</CardTitle>
            <CardDescription>
              Connect your Google Sheet or Excel Online file. Make sure the sheet is shared with our service account for Google Sheets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddIntegration} className="space-y-4">
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select value={formData.platform} onValueChange={(v) => setFormData(prev => ({ ...prev, platform: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google_sheets">Google Sheets</SelectItem>
                    <SelectItem value="excel_online">Excel Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Sheet URL</Label>
                <Input
                  placeholder={
                    formData.platform === 'google_sheets'
                      ? 'https://docs.google.com/spreadsheets/d/...'
                      : 'https://onedrive.live.com/...'
                  }
                  value={formData.sheet_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, sheet_url: e.target.value }))}
                />
                {formData.platform === 'google_sheets' && (
                  <p className="text-xs text-muted-foreground">
                    Share your sheet with the service account email (ask admin for the email address)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Sheet/Tab Name</Label>
                <Input
                  placeholder="Bookings"
                  value={formData.sheet_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, sheet_name: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Name of the worksheet tab to use (default: "Bookings")
                </p>
              </div>

              <Button type="submit" className="w-full">Link Sheet</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {integrations.length === 0 && !showAddForm ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileSpreadsheet className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground mb-2">No spreadsheets linked yet</p>
            <p className="text-xs text-muted-foreground text-center max-w-md mb-4">
              Link your Google Sheets or Excel Online file to keep your booking records synced automatically.
              Changes in the sheet (new rows, status updates) will sync to your dashboard and vice versa.
            </p>
            <Button onClick={() => setShowAddForm(true)} variant="outline">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Link Your First Sheet
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {integrations.map((integration) => (
            <Card key={integration.id}>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {getSyncStatusIcon(integration.sync_status)}
                      <span className="font-medium">
                        {integration.platform === 'google_sheets' ? 'Google Sheets' : 'Excel Online'}
                      </span>
                      {getSyncStatusBadge(integration.sync_status)}
                    </div>
                    <p className="text-sm text-muted-foreground truncate max-w-md">
                      {integration.sheet_url}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Tab: {integration.sheet_name}</span>
                      {integration.last_synced_at && (
                        <span>Last synced: {format(new Date(integration.last_synced_at), 'MMM d, h:mm a')}</span>
                      )}
                    </div>
                    {integration.sync_error && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertDescription className="text-xs">{integration.sync_error}</AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!integration.last_synced_at && (
                      <Button
                        size="sm"
                        onClick={() => handleSync(integration.id, 'initialize_sheet')}
                        disabled={syncing === integration.id}
                      >
                        {syncing === integration.id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <FileSpreadsheet className="mr-1 h-3 w-3" />
                        )}
                        Initialize
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSync(integration.id, 'sync_to_sheet')}
                      disabled={syncing === integration.id}
                      title="Push bookings to sheet"
                    >
                      {syncing === integration.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <ArrowUp className="mr-1 h-3 w-3" />
                      )}
                      To Sheet
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSync(integration.id, 'sync_from_sheet')}
                      disabled={syncing === integration.id}
                      title="Pull changes from sheet"
                    >
                      {syncing === integration.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <ArrowDown className="mr-1 h-3 w-3" />
                      )}
                      From Sheet
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => handleSync(integration.id, 'full_sync')}
                      disabled={syncing === integration.id}
                      title="Full bidirectional sync"
                    >
                      {syncing === integration.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <ArrowUpDown className="mr-1 h-3 w-3" />
                      )}
                      Full Sync
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(integration.sheet_url, '_blank')}
                      title="Open sheet"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(integration.id)}
                      title="Remove integration"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Alert>
        <FileSpreadsheet className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>How it works:</strong> When a booking is created on the website, it's automatically added to your sheet.
          When you add a new row or change a status in the sheet, click "From Sheet" to sync those changes back.
          Use "Full Sync" for bidirectional sync. Column format: Booking ID, Court Name, Date, Start/End Time,
          Customer Name, Phone, Email, Status, Payment Status, Price, Screenshot, Notes, Created At.
        </AlertDescription>
      </Alert>
    </div>
  );
}
