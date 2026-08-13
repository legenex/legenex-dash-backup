import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { metaConnectionStatus } from '@/functions/metaConnectionStatus';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Facebook, FileSpreadsheet, Upload, Phone, Truck, Webhook } from 'lucide-react';
import CsvImporter from '@/components/settings/CsvImporter';
import DuplicateScanner from '@/components/settings/DuplicateScanner';
import LeadSourcesPanel from '@/components/settings/LeadSourcesPanel';
import GoogleSheetsPanel from '@/components/settings/GoogleSheetsPanel';
import SettingsSuppliers from '@/components/settings/SettingsSuppliers';
import SettingsInboundWebhooks from '@/components/settings/SettingsInboundWebhooks';
import MetaAppCredentialsCard from '@/components/settings/MetaAppCredentialsCard';

// Data Sources is a dashboard of source types. Each tile opens the surface for
// that type rather than stacking every panel on one scroll, which is how this
// page used to read.

function SourceTile({ icon: Icon, title, description, stats = [], status = 'ok', onOpen }) {
  const dot = status === 'attention' ? 'bg-primary' : status === 'idle' ? 'bg-muted-foreground' : 'bg-chart-5';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left bg-card border border-border rounded-lg p-5 flex flex-col hover:border-primary/40 transition-colors duration-200"
    >
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <span className={`w-2 h-2 rounded-full mt-1.5 ${dot}`} title={status} />
      </div>
      <div className="mt-4">
        <div className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          {title}
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
        </div>
        <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
      {stats.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-[18px] font-bold text-foreground leading-none">{s.value}</div>
              <div className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wide truncate">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

const VIEWS = {
  meta: { title: 'Meta (Facebook)', subtitle: 'App credentials for the Meta Ads connector.' },
  sheets: { title: 'Google Sheets', subtitle: 'Connected spreadsheets and what each one is for.' },
  csv: { title: 'CSV and Excel Import', subtitle: 'One-off uploads, repair and duplicate scanning.' },
  calls: { title: 'Call Platforms', subtitle: 'Ringba and TrueCall inbound call webhooks.' },
  webhooks: { title: 'Webhooks', subtitle: 'Posts we receive, and pulls we make on a schedule.' },
  suppliers: { title: 'Suppliers', subtitle: 'Who sends leads, and how they are identified.' },
};

export default function SettingsDataSources() {
  const [view, setView] = useState(null);

  const { data: sources = [] } = useQuery({
    queryKey: ['lead-sources'],
    queryFn: async () => (await base44.entities.LeadSource.list('-created_date', 200)) || [],
  });
  const { data: routes = [] } = useQuery({
    queryKey: ['inbound-webhook-routes'],
    queryFn: async () => (await base44.entities.InboundWebhookRoute.list('-created_date', 200)) || [],
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-count'],
    queryFn: async () => (await base44.entities.Supplier.list('name', 200)) || [],
  });
  const { data: metaStatus } = useQuery({
    queryKey: ['meta-connection-status'],
    queryFn: async () => (await metaConnectionStatus({})).data,
  });

  const counts = useMemo(() => {
    const sheets = sources.filter((s) => s.kind === 'google_sheets');
    const calls = sources.filter((s) => s.kind === 'ringba' || s.kind === 'truecall');
    return {
      sheets: sheets.length,
      sheetsLive: sheets.filter((s) => s.enabled).length,
      calls: calls.length,
      callsLive: calls.filter((s) => s.enabled).length,
      routes: routes.length,
      routesLive: routes.filter((r) => r.enabled).length,
      receipts: routes.reduce((sum, r) => sum + (Number(r.receipt_count) || 0), 0),
      suppliers: suppliers.length,
      suppliersLive: suppliers.filter((s) => s.active !== false).length,
    };
  }, [sources, routes, suppliers]);

  const metaConnected = (metaStatus?.connections?.length || 0) > 0;

  if (view) {
    const meta = VIEWS[view];
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-foreground hover:bg-accent -ml-2" onClick={() => setView(null)}>
            <ArrowLeft className="w-4 h-4" /> Data Sources
          </Button>
        </div>
        <div>
          <div className="text-[15px] font-semibold text-foreground">{meta.title}</div>
          <p className="text-[13px] text-muted-foreground mt-0.5">{meta.subtitle}</p>
        </div>

        {view === 'meta' && <MetaAppCredentialsCard />}
        {view === 'sheets' && <GoogleSheetsPanel />}
        {view === 'csv' && (
          <div className="space-y-6">
            <CsvImporter />
            {/* Sits with the importer because that is where duplicates originate. */}
            <DuplicateScanner />
          </div>
        )}
        {view === 'calls' && <LeadSourcesPanel />}
        {view === 'webhooks' && <SettingsInboundWebhooks />}
        {view === 'suppliers' && <SettingsSuppliers />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground max-w-2xl">
        Every way data reaches this workspace. Open a source type to connect, configure or audit it.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SourceTile
          icon={Facebook}
          title="Meta (Facebook)"
          description="App credentials for the Meta Ads connector, used for ad spend and lead forms."
          status={metaConnected ? 'ok' : 'attention'}
          stats={[
            { label: 'Ad accounts', value: metaStatus?.connections?.length || 0 },
            { label: 'State', value: metaConnected ? 'Connected' : 'Not connected' },
          ]}
          onOpen={() => setView('meta')}
        />
        <SourceTile
          icon={FileSpreadsheet}
          title="Google Sheets"
          description="Feedback, call, cost and lead sheets, each with its own purpose and mapping."
          status={counts.sheets === 0 ? 'idle' : 'ok'}
          stats={[
            { label: 'Connected', value: counts.sheets },
            { label: 'Syncing', value: counts.sheetsLive },
          ]}
          onOpen={() => setView('sheets')}
        />
        <SourceTile
          icon={Webhook}
          title="Webhooks"
          description="Buyer dispositions, call payouts and cost posts from any platform that sends JSON."
          status={counts.routes === 0 ? 'idle' : 'ok'}
          stats={[
            { label: 'Routes', value: counts.routes },
            { label: 'Receipts', value: counts.receipts.toLocaleString() },
          ]}
          onOpen={() => setView('webhooks')}
        />
        <SourceTile
          icon={Upload}
          title="CSV and Excel Import"
          description="One-off file uploads with AI column mapping, plus repair and duplicate scanning."
          stats={[
            { label: 'Mode', value: 'Manual' },
            { label: 'Targets', value: 'Leads, bank' },
          ]}
          onOpen={() => setView('csv')}
        />
        <SourceTile
          icon={Phone}
          title="Call Platforms"
          description="Ringba and TrueCall webhooks, ingested through the same lead pipeline."
          status={counts.calls === 0 ? 'idle' : 'ok'}
          stats={[
            { label: 'Connected', value: counts.calls },
            { label: 'Live', value: counts.callsLive },
          ]}
          onOpen={() => setView('calls')}
        />
        <SourceTile
          icon={Truck}
          title="Suppliers"
          description="Who sends leads, their sid and how their traffic is identified on the way in."
          status={counts.suppliers === 0 ? 'attention' : 'ok'}
          stats={[
            { label: 'Suppliers', value: counts.suppliers },
            { label: 'Active', value: counts.suppliersLive },
          ]}
          onOpen={() => setView('suppliers')}
        />
      </div>
    </div>
  );
}
