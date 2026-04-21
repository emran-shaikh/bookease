import { useEffect, useMemo, useState } from 'react';
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
import { Loader2, FileSpreadsheet, Trash2, ExternalLink, CheckCircle, XCircle, Clock, ArrowUpDown, ArrowDown, ArrowUp, ShieldCheck, AlertTriangle, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';

type Integration = {
  id: string;
  owner_id: string;
  sheet_url: string;
  sheet_id: string | null;
  platform: string;
  sheet_name: string;
  is_active: boolean;
  auto_sync_enabled: boolean;
  last_synced_at: string | null;
  last_push_at: string | null;
  last_pull_at: string | null;
  sync_status: string;
  sync_error: string | null;
  created_at: string;
};

type SyncCapabilities = {
  google_sheets?: {
    authenticated: boolean;
    write_enabled: boolean;
  };
};

type SyncLog = {
  id: string;
  integration_id: string;
  direction: string;
  run_type: string;
  records_synced: number;
  records_failed: number;
  records_created: number;
  records_updated: number;
  records_cancelled: number;
  records_skipped: number;
  records_conflicted: number;
  error_details: string | null;
  started_at: string;
  completed_at: string | null;
};

export function SheetIntegrationPanel() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(true);
  const [syncCapabilities, setSyncCapabilities] = useState<SyncCapabilities | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    sheet_url: '',
    platform: 'google_sheets',
    sheet_name: 'Bookings',
  });

  useEffect(() => {
    if (!user) return;
    void fetchIntegrations();
    void fetchSyncCapabilities();
  }, [user]);

  async function fetchSyncCapabilities() {
    setCapabilitiesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-sheet', {
        body: { action: 'get_capabilities' },
      });
      if (error) throw error;
      setSyncCapabilities((data as SyncCapabilities) || null);
    } catch {
      setSyncCapabilities(null);
    } finally {
      setCapabilitiesLoading(false);
    }
  }

  async function fetchIntegrations() {
    setLoading(true);
    const { data, error } = await supabase
      .from('sheet_integrations')
      .select('*')
      .eq('owner_id', user?.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const all = (data as Integration[]) || [];
    setIntegrations(all);

    if (all.length) {
      const ids = all.map((i) => i.id);
      const { data: logRows } = await supabase
        .from('sheet_sync_logs')
        .select('*')
        .in('integration_id', ids)
        .order('started_at', { ascending: false })
        .limit(100);
      setLogs((logRows as SyncLog[]) || []);
    } else {
      setLogs([]);
    }

    setLoading(false);
  }

  async function handleAddIntegration(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.sheet_url) {
      toast({ title: 'Error', description: 'Please enter a sheet URL', variant: 'destructive' });
      return;
    }

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

      toast({ title: 'Success', description: 'Sheet linked. Initialize once, then auto-sync runs continuously.' });
      setShowAddForm(false);
      setFormData({ sheet_url: '', platform: 'google_sheets', sheet_name: 'Bookings' });
      await fetchIntegrations();
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
      toast({ title: 'Sync Complete', description: data.message || 'Sync finished' });
      await fetchIntegrations();
    } catch (error: any) {
      toast({ title: 'Sync Failed', description: error.message, variant: 'destructive' });
      await fetchIntegrations();
    } finally {
      setSyncing(null);
    }
  }

  async function handleToggleAutoSync(integration: Integration) {
    try {
      const { error } = await supabase
        .from('sheet_integrations')
        .update({ auto_sync_enabled: !integration.auto_sync_enabled })
        .eq('id', integration.id);

      if (error) throw error;
      toast({ title: 'Updated', description: `Auto-sync ${!integration.auto_sync_enabled ? 'enabled' : 'disabled'}.` });
      await fetchIntegrations();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  async function handleDelete(integrationId: string) {
    if (!confirm('Remove this sheet integration?')) return;
    try {
      const { error } = await supabase.from('sheet_integrations').delete().eq('id', integrationId);
      if (error) throw error;
      toast({ title: 'Removed', description: 'Sheet integration removed' });
      await fetchIntegrations();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  }

  const logsByIntegration = useMemo(() => {
    const map = new Map<string, SyncLog[]>();
    for (const log of logs) {
      if (!map.has(log.integration_id)) map.set(log.integration_id, []);
      map.get(log.integration_id)!.push(log);
    }
    return map;
  }, [logs]);

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-primary" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'syncing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const isGoogleWriteEnabled = !!syncCapabilities?.google_sheets?.write_enabled;

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
            Live two-way sync between site bookings and owner spreadsheet operations
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={capabilitiesLoading ? 'outline' : isGoogleWriteEnabled ? 'default' : 'destructive'}>
              {capabilitiesLoading ? 'Checking auth...' : isGoogleWriteEnabled ? 'Write Access Ready' : 'Write Access Missing'}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {capabilitiesLoading
                ? 'Verifying sync credentials.'
                : isGoogleWriteEnabled
                  ? 'Automatic push/pull enabled.'
                  : 'Enable Google Sheets + Drive APIs and share sheet with service account.'}
            </span>
          </div>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} variant={showAddForm ? 'outline' : 'default'}>
          {showAddForm ? 'Cancel' : '+ Link Sheet'}
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Link a Spreadsheet</CardTitle>
            <CardDescription>Connect your operations sheet for real-time reconciliation.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddIntegration} className="space-y-4">
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select value={formData.platform} onValueChange={(v) => setFormData((p) => ({ ...p, platform: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google_sheets">Google Sheets</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Sheet URL</Label>
                <Input
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={formData.sheet_url}
                  onChange={(e) => setFormData((p) => ({ ...p, sheet_url: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Sheet/Tab Name</Label>
                <Input
                  placeholder="Bookings"
                  value={formData.sheet_name}
                  onChange={(e) => setFormData((p) => ({ ...p, sheet_name: e.target.value }))}
                />
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
            <Button onClick={() => setShowAddForm(true)} variant="outline">
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Link Your First Sheet
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {integrations.map((integration) => {
            const latestLogs = logsByIntegration.get(integration.id) || [];
            const latest = latestLogs[0];
            const healthChecks = [
              { label: 'API access', ok: isGoogleWriteEnabled },
              { label: 'Sheet linked', ok: !!integration.sheet_url },
              { label: 'Tab configured', ok: !!integration.sheet_name },
              { label: 'Auto-sync', ok: integration.auto_sync_enabled },
            ];

            return (
              <Card key={integration.id}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {getSyncStatusIcon(integration.sync_status)}
                        <span className="font-medium">Google Sheets</span>
                        <Badge variant={integration.sync_status === 'error' ? 'destructive' : integration.sync_status === 'success' ? 'default' : 'outline'}>
                          {integration.sync_status === 'success' ? 'Connected' : integration.sync_status === 'error' ? 'Attention Needed' : 'Pending'}
                        </Badge>
                        <Badge variant={integration.auto_sync_enabled ? 'default' : 'secondary'}>
                          {integration.auto_sync_enabled ? 'Auto-sync active' : 'Auto-sync paused'}
                        </Badge>
                      </div>

                      <p className="text-sm text-muted-foreground truncate max-w-md">{integration.sheet_url}</p>

                      <div className="grid gap-1 text-xs text-muted-foreground">
                        <span>Tab: {integration.sheet_name}</span>
                        {integration.last_push_at && <span>Last push: {format(new Date(integration.last_push_at), 'MMM d, h:mm a')}</span>}
                        {integration.last_pull_at && <span>Last pull: {format(new Date(integration.last_pull_at), 'MMM d, h:mm a')}</span>}
                        {integration.last_synced_at && <span>Last sync: {format(new Date(integration.last_synced_at), 'MMM d, h:mm a')}</span>}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!integration.last_synced_at && (
                        <Button size="sm" onClick={() => handleSync(integration.id, 'initialize_sheet')} disabled={syncing === integration.id}>
                          {syncing === integration.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <FileSpreadsheet className="mr-1 h-3 w-3" />}
                          Initialize
                        </Button>
                      )}

                      <Button size="sm" variant="outline" onClick={() => handleSync(integration.id, 'sync_to_sheet')} disabled={syncing === integration.id}>
                        {syncing === integration.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ArrowUp className="mr-1 h-3 w-3" />}
                        To Sheet
                      </Button>

                      <Button size="sm" variant="outline" onClick={() => handleSync(integration.id, 'sync_from_sheet')} disabled={syncing === integration.id}>
                        {syncing === integration.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ArrowDown className="mr-1 h-3 w-3" />}
                        From Sheet
                      </Button>

                      <Button size="sm" onClick={() => handleSync(integration.id, 'full_sync')} disabled={syncing === integration.id}>
                        {syncing === integration.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <ArrowUpDown className="mr-1 h-3 w-3" />}
                        Full Sync
                      </Button>

                      <Button size="sm" variant="secondary" onClick={() => handleSync(integration.id, 'replay_last_failed_run')} disabled={syncing === integration.id}>
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Replay Failed
                      </Button>

                      <Button size="sm" variant="outline" onClick={() => handleToggleAutoSync(integration)}>
                        {integration.auto_sync_enabled ? 'Pause Auto' : 'Enable Auto'}
                      </Button>

                      <Button size="sm" variant="ghost" onClick={() => window.open(integration.sheet_url, '_blank')}>
                        <ExternalLink className="h-3 w-3" />
                      </Button>

                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(integration.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <Card className="border-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Sync Health</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 text-xs">
                        {healthChecks.map((item) => (
                          <div key={item.label} className="flex items-center justify-between">
                            <span>{item.label}</span>
                            <Badge variant={item.ok ? 'default' : 'destructive'}>{item.ok ? 'OK' : 'Fix'}</Badge>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="border-border">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Latest Run</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 text-xs">
                        {latest ? (
                          <>
                            <div className="flex justify-between"><span>Run</span><span>{latest.run_type} / {latest.direction}</span></div>
                            <div className="flex justify-between"><span>Created</span><span>{latest.records_created}</span></div>
                            <div className="flex justify-between"><span>Updated</span><span>{latest.records_updated}</span></div>
                            <div className="flex justify-between"><span>Cancelled</span><span>{latest.records_cancelled}</span></div>
                            <div className="flex justify-between"><span>Conflicts</span><span>{latest.records_conflicted}</span></div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">No sync runs yet.</span>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {integration.sync_error && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">{integration.sync_error}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Alert>
        <FileSpreadsheet className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Required columns are auto-managed: Booking ID, Booking UUID, Court, Date, Start/End, Customer, Status, Payment, Price, Screenshot, Notes, Source Updated At, Created At. Deleting a linked row cancels that booking.
        </AlertDescription>
      </Alert>
    </div>
  );
}
