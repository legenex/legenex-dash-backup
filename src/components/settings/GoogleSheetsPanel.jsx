import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, RefreshCw, Pencil, Trash2, Loader2, FileSpreadsheet, FlaskConical, ExternalLink, CheckCircle2, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import SheetSourceDialog from '@/components/settings/SheetSourceDialog';
import GooglePickerSettings, { GooglePickerStatus } from '@/components/settings/GooglePickerSettings';
import { SHEET_PURPOSES, purposeMeta } from '@/components/settings/dataSourcePurposes';

const ALL = '__all__';

export default function GoogleSheetsPanel() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState({ open: false, source: null });
  const [busyId, setBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filter, setFilter] = useState(ALL);
  const [pickerSetupOpen, setPickerSetupOpen] = useState(false);

  const { data: allSources = [] } = useQuery({
    queryKey: ['lead-sources'],
    queryFn: async () => (await base44.entities.LeadSource.list('-created_date', 200)) || [],
  });

  // The connected Google account, shown here rather than only in Integrations,
  // because this is where an operator notices it is broken.
  const { data: account, refetch: refetchAccount, isFetching: checkingAccount } = useQuery({
    queryKey: ['google-sheets-account'],
    queryFn: async () => (await base44.functions.invoke('syncGoogleSheets', { account_status: true })).data,
  });

  const sheets = useMemo(
    () => (allSources || []).filter((s) => s.kind === 'google_sheets'),
    [allSources],
  );
  const visible = filter === ALL ? sheets : sheets.filter((s) => (s.purpose || 'leads') === filter);

  const refresh = () => qc.invalidateQueries({ queryKey: ['lead-sources'] });

  const runSync = async (s, dryRun) => {
    setBusyId(s.id);
    try {
      const res = await base44.functions.invoke('syncGoogleSheets', { source_id: s.id, dry_run: dryRun });
      const r = res.data?.results?.[0];
      if (r?.error) toast.error(`Sync failed: ${r.error}`);
      else if (dryRun) toast.success(`Dry run: ${r?.written ?? 0} rows would be written, ${r?.skipped ?? 0} skipped of ${r?.read ?? 0}`);
      else toast.success(`${r?.written ?? 0} written, ${r?.skipped ?? 0} skipped of ${r?.read ?? 0} rows`);
      refresh();
    } catch {
      toast.error('Sync failed');
    }
    setBusyId(null);
  };

  const toggleEnabled = async (s) => {
    await base44.entities.LeadSource.update(s.id, { enabled: !s.enabled });
    refresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.LeadSource.delete(deleteTarget.id);
    setDeleteTarget(null);
    toast.success('Sheet disconnected');
    refresh();
  };

  const counts = useMemo(() => {
    const m = { [ALL]: sheets.length };
    for (const p of SHEET_PURPOSES) m[p.value] = sheets.filter((s) => (s.purpose || 'leads') === p.value).length;
    return m;
  }, [sheets]);

  return (
    <div className="space-y-4">
      {/* Connected Google account */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-foreground flex items-center gap-2">
                Google account
                <span className={`text-[11px] inline-flex items-center gap-1 font-medium ${account?.connected ? 'status-sold' : 'text-muted-foreground'}`}>
                  {account?.connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                  {account?.connected ? 'Reading enabled' : 'Not connected'}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {account?.connected
                  ? `${account.account || 'connected'} \u00b7 ${account.can_list ? 'sheets and Drive browsing both available' : 'sheets are read server side with this account'}`
                  : 'Not connected. Connect it in Settings, Integrations, Google Sheets.'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <GooglePickerStatus onConfigure={() => setPickerSetupOpen(true)} />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => refetchAccount()} disabled={checkingAccount}>
              {checkingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Recheck
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <p className="text-[13px] text-muted-foreground max-w-2xl">
          Every spreadsheet this workspace reads, and what each one is for. A sheet's purpose decides where its rows are written, so a feedback sheet can never leak into the lead pipeline. Connected sheets sync continuously.
        </p>
        <Button size="sm" onClick={() => setDialog({ open: true, source: null })} className="gap-1.5 shrink-0">
          <Plus className="w-4 h-4" /> Connect sheet
        </Button>
      </div>

      {/* Purpose filter */}
      <div className="border-b border-border flex items-center gap-0.5 overflow-x-auto no-scrollbar">
        {[{ value: ALL, short: 'All' }, ...SHEET_PURPOSES].map((p) => {
          const active = filter === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => setFilter(p.value)}
              className={`px-3.5 py-2 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {p.short}
              <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {counts[p.value] || 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {visible.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileSpreadsheet className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <div className="text-[13px] text-muted-foreground">
              {sheets.length === 0 ? 'No spreadsheets connected yet.' : 'No sheets with this purpose.'}
            </div>
          </div>
        ) : visible.map((s) => {
          const meta = purposeMeta(SHEET_PURPOSES, s.purpose || 'leads');
          let lastCounts = null;
          try { lastCounts = s.last_run_counts ? JSON.parse(s.last_run_counts) : null; } catch { lastCounts = null; }
          return (
            <div key={s.id} className="border-b border-border last:border-b-0 px-4 py-3 hover:bg-accent transition-colors">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-foreground truncate">{s.name}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-primary">
                      {meta.label}
                    </span>
                    {!s.enabled && (
                      <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {s.spreadsheet_name || s.sheet_id || 'no spreadsheet'}
                    {s.worksheet ? ` / ${s.worksheet}` : ''}
                    {s.buyer_code ? ` \u00b7 ${s.buyer_code}` : s.supplier_name ? ` \u00b7 ${s.supplier_name}` : ''}
                    {s.last_synced_at
                      ? ` \u00b7 ${formatDistanceToNow(new Date(s.last_synced_at), { addSuffix: true })}`
                      : ' \u00b7 never synced'}
                    {lastCounts ? ` \u00b7 ${lastCounts.written} written, ${lastCounts.skipped} skipped` : ''}
                  </div>
                </div>

                <Switch checked={!!s.enabled} onCheckedChange={() => toggleEnabled(s)} />
                <Button
                  size="sm" variant="ghost" className="h-8 gap-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent"
                  title="Report what would be written, without writing anything"
                  onClick={() => runSync(s, true)} disabled={busyId === s.id}
                >
                  <FlaskConical className="w-3.5 h-3.5" /> Dry run
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-8 gap-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent"
                  onClick={() => runSync(s, false)} disabled={busyId === s.id}
                >
                  {busyId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sync
                </Button>
                {s.sheet_id && (
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${s.sheet_id}`}
                    target="_blank" rel="noreferrer"
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                    title="Open in Google Sheets"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-accent" title="Edit" onClick={() => setDialog({ open: true, source: s })}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" title="Disconnect" onClick={() => setDeleteTarget(s)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <SheetSourceDialog
        open={dialog.open}
        source={dialog.source}
        onOpenChange={(v) => setDialog((p) => ({ ...p, open: v }))}
        onSaved={refresh}
      />

      <GooglePickerSettings open={pickerSetupOpen} onOpenChange={setPickerSetupOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes "{deleteTarget?.name}" and its sync history. Records already written from it are kept. The spreadsheet itself is untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
