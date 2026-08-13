import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, ShieldAlert, Loader2, RefreshCw, FileSpreadsheet, ArrowRight } from 'lucide-react';
import { SHEET_PURPOSES, purposeMeta } from '@/components/settings/dataSourcePurposes';

// Real management for the Google Sheets connection: which account is linked,
// what it can actually do, and every sheet reading through it. The generic
// OAuth dialog only offered "Refresh status", which told an operator nothing.
export default function GoogleSheetsManageDialog({ open, onOpenChange }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: account, isFetching, refetch } = useQuery({
    queryKey: ['google-sheets-account'],
    queryFn: async () => (await base44.functions.invoke('syncGoogleSheets', { account_status: true })).data,
    enabled: open,
  });

  const { data: sources = [] } = useQuery({
    queryKey: ['lead-sources'],
    queryFn: async () => (await base44.entities.LeadSource.list('-created_date', 200)) || [],
    enabled: open,
  });

  const sheets = (sources || []).filter((s) => s.kind === 'google_sheets');
  const connected = !!account?.connected;
  const canList = !!account?.can_list;

  const goToSheets = () => {
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ['lead-sources'] });
    navigate('/settings?tab=data-sources');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[540px] max-h-[86vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Google Sheets</DialogTitle>
          <DialogDescription>The account this workspace reads spreadsheets with.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Connection */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Connected account</div>
                <div className="text-[13px] text-foreground truncate mt-0.5">
                  {isFetching && !account ? 'Checking' : (account?.account || (connected ? 'Connected' : 'Not connected'))}
                </div>
              </div>
              <span className={`text-[11px] inline-flex items-center gap-1 font-medium shrink-0 ${connected ? 'status-sold' : 'text-muted-foreground'}`}>
                {connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                {connected ? 'Active' : 'Not connected'}
              </span>
            </div>

            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-muted-foreground">Read spreadsheet data</span>
                <span className={`text-[11px] inline-flex items-center gap-1 font-medium ${connected ? 'status-sold' : 'text-muted-foreground'}`}>
                  {connected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                  {connected ? 'Granted' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-muted-foreground">Browse files in your Drive</span>
                <span className={`text-[11px] inline-flex items-center gap-1 font-medium ${canList ? 'status-sold' : 'text-muted-foreground'}`}>
                  {canList ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                  {canList ? 'Granted' : 'Not granted'}
                </span>
              </div>
              {!canList && connected && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Listing files is a Google Drive permission, separate from Sheets. Without it the sheet picker cannot show your files, so sheets are added by pasting their link. Reading, tabs, columns and syncing all work exactly the same either way.
                </p>
              )}
            </div>
          </div>

          {/* Sheets reading through this connection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-medium text-foreground">Sheets using this connection</div>
              <span className="text-[11px] text-muted-foreground">{sheets.length}</span>
            </div>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {sheets.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <FileSpreadsheet className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
                  <div className="text-[12px] text-muted-foreground">No spreadsheets connected yet.</div>
                </div>
              ) : sheets.map((s) => (
                <div key={s.id} className="border-b border-border last:border-b-0 px-4 py-3 flex items-center gap-3">
                  <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-foreground truncate">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {s.spreadsheet_name || s.sheet_id}{s.worksheet ? ` / ${s.worksheet}` : ''}
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground shrink-0">
                    {purposeMeta(SHEET_PURPOSES, s.purpose || 'leads').label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" className="gap-1.5" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Recheck
          </Button>
          <Button className="gap-1.5" onClick={goToSheets}>
            Manage sheets <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
