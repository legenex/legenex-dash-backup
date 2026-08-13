import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { simulateRoute } from '@/lib/distribution/simulator';
import SectionHeader from '@/components/shared/SectionHeader';
import SimulatorResult from '@/components/distribution/SimulatorResult';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Play, Loader2, FlaskConical, AlertTriangle, Radio } from 'lucide-react';

// Fields collected by the structured Live-config test lead form. `extra` holds any
// additional attributes as JSON and is merged onto the lead before simulation.
const LEAD_FIELDS = [
  { key: 'state', label: 'State', placeholder: 'CA' },
  { key: 'zip', label: 'ZIP', placeholder: '90210' },
  { key: 'county', label: 'County', placeholder: 'Los Angeles' },
  { key: 'vertical', label: 'Vertical', placeholder: 'mva' },
  { key: 'brand', label: 'Brand', placeholder: 'legenex' },
  { key: 'supplier', label: 'Supplier', placeholder: 'acme-media' },
  { key: 'source', label: 'Source', placeholder: 'paid-search' },
];

const EMPTY_LEAD = LEAD_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {});

// Build the lead object sent to simulation from the structured fields plus the
// parsed extra-fields JSON. Empty structured fields are dropped so they don't
// override extra-field values with blanks.
function buildLiveLead(fields, extraObj) {
  const lead = { ...(extraObj || {}) };
  for (const { key } of LEAD_FIELDS) {
    const v = String(fields[key] ?? '').trim();
    if (v !== '') lead[key] = v;
  }
  return lead;
}

// A realistic hypothetical config for the What-if tab. Two ordered groups: a
// priority group that excludes non-CA/non-mva leads, then an auction fallback.
const SAMPLE_CONFIG = JSON.stringify(
  {
    groups: [
      {
        id: 'grp-priority-mva',
        orderIndex: 0,
        active: true,
        method: 'priority',
        members: [
          {
            id: 'mem-apex',
            buyerId: 'buyer-apex',
            active: true,
            priority: 1,
            price: 42.5,
            buyer: { status: 'active', active: true },
            filters: { states: ['CA', 'TX'], verticals: ['mva'] },
            caps: { daily: { limit: 100, count: 12 } },
            wallet: { mode: 'prepaid', balance: 500 },
          },
          {
            id: 'mem-northwind',
            buyerId: 'buyer-northwind',
            active: true,
            priority: 2,
            price: 38,
            buyer: { status: 'active', active: true },
            filters: { states: ['CA'], verticals: ['mva'] },
            caps: { daily: { limit: 50, count: 50 } },
            wallet: { mode: 'postpaid', outstanding: 120, creditLimit: 1000 },
          },
        ],
      },
      {
        id: 'grp-auction-fallback',
        orderIndex: 1,
        active: true,
        method: 'auction',
        members: [
          {
            id: 'mem-summit',
            buyerId: 'buyer-summit',
            active: true,
            priceMode: 'auction',
            bid: 30,
            reservePrice: 25,
            buyer: { status: 'active', active: true },
            filters: { verticals: ['mva', 'workers-comp'] },
            wallet: { mode: 'prepaid', balance: 200 },
          },
        ],
      },
    ],
  },
  null,
  2,
);

const SAMPLE_WHATIF_LEAD = JSON.stringify(
  {
    state: 'CA',
    zip: '90210',
    county: 'Los Angeles',
    vertical: 'mva',
    brand: 'legenex',
    supplier: 'acme-media',
    source: 'paid-search',
    email: 'test.lead@example.com',
  },
  null,
  2,
);

// Parse JSON and return { ok, value, error } without throwing.
function tryParse(text) {
  if (!String(text ?? '').trim()) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export default function RouteSimulator() {
  return (
    <>
      <SectionHeader
        title="Route Simulator"
        subtitle="Trace how a test lead would route, with zero side effects. Nothing is sent, reserved, or billed."
      />
      <div className="pb-8">
        <Tabs defaultValue="live" className="w-full">
          <TabsList>
            <TabsTrigger value="live">Live config</TabsTrigger>
            <TabsTrigger value="whatif">What-if JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="mt-4">
            <LiveConfigTab />
          </TabsContent>

          <TabsContent value="whatif" className="mt-4">
            <WhatIfTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

// --- Live config tab: calls the real backend distributionSimulate function ---
function LiveConfigTab() {
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => base44.entities.Campaign.list('-created_date', 500),
  });

  const [campaignId, setCampaignId] = useState('');
  const [fields, setFields] = useState(EMPTY_LEAD);
  const [extra, setExtra] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const extraParse = useMemo(() => tryParse(extra), [extra]);
  const extraInvalid = !extraParse.ok;

  const setField = (key, value) => setFields((f) => ({ ...f, [key]: value }));

  const run = async () => {
    if (!campaignId) { toast.error('Select a campaign first'); return; }
    if (extraInvalid) { toast.error('Fix the extra-fields JSON before running'); return; }
    setRunning(true);
    setResult(null);
    try {
      const lead = buildLiveLead(fields, extraParse.value);
      const res = await base44.functions.invoke('distributionSimulate', { campaign_id: campaignId, lead });
      setResult(res.data);
      toast.success('Simulation complete');
    } catch (e) {
      toast.error('Simulation failed: ' + (e?.message || 'error'));
      setResult(null);
    }
    setRunning(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      {/* Input */}
      <div className="rounded-[10px] border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Published config</div>
        </div>

        <div>
          <Label className="text-[12px] font-medium">Campaign</Label>
          <Select value={campaignId} onValueChange={setCampaignId} disabled={campaignsLoading}>
            <SelectTrigger className="mt-1.5 bg-background" aria-label="Campaign">
              <SelectValue placeholder={campaignsLoading ? 'Loading campaigns...' : 'Select a campaign'} />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name || c.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">Runs against this campaign's currently published routing config.</p>
        </div>

        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Test lead</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LEAD_FIELDS.map((f) => (
              <div key={f.key}>
                <Label htmlFor={`lead-${f.key}`} className="text-[12px] font-medium">{f.label}</Label>
                <Input
                  id={`lead-${f.key}`}
                  value={fields[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="mt-1 bg-background text-[13px]"
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="extra-fields" className="text-[12px] font-medium">Extra fields (JSON)</Label>
          <Textarea
            id="extra-fields"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder={'{\n  "email": "test.lead@example.com"\n}'}
            className="mt-1 bg-background font-mono text-[12px] min-h-[110px] leading-relaxed"
            aria-invalid={extraInvalid}
          />
          {extraInvalid && (
            <p className="flex items-center gap-1.5 text-[11px] status-error mt-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Invalid JSON: {extraParse.error}
            </p>
          )}
        </div>

        <Button onClick={run} disabled={running || extraInvalid} className="gap-1.5 w-full">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {running ? 'Simulating...' : 'Run simulation'}
        </Button>
      </div>

      {/* Output */}
      <div>
        {result ? (
          <SimulatorResult result={result} />
        ) : (
          <div className="rounded-[10px] border border-border bg-card p-10 text-center">
            <Radio className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <div className="text-[13px] font-medium text-foreground">Run a simulation to see the routing decision</div>
            <div className="text-[12px] text-muted-foreground mt-1">
              The winning member, config version, and a per-group candidate breakdown appear here.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- What-if JSON tab: runs the pure client-side engine on hypothetical config ---
function WhatIfTab() {
  const [configText, setConfigText] = useState(SAMPLE_CONFIG);
  const [leadText, setLeadText] = useState(SAMPLE_WHATIF_LEAD);
  const [result, setResult] = useState(null);

  const configParse = useMemo(() => tryParse(configText), [configText]);
  const leadParse = useMemo(() => tryParse(leadText), [leadText]);
  const configInvalid = !configParse.ok;
  const leadInvalid = !leadParse.ok;

  const loadSample = () => {
    setConfigText(SAMPLE_CONFIG);
    setLeadText(SAMPLE_WHATIF_LEAD);
    setResult(null);
  };

  const run = () => {
    if (configInvalid || leadInvalid) { toast.error('Fix the JSON before running'); return; }
    try {
      const config = configParse.value && configParse.value.groups
        ? configParse.value
        : { groups: configParse.value };
      const out = simulateRoute(config, leadParse.value, { nowMs: Date.now(), timezone: 'America/New_York' });
      setResult(out);
      toast.success('Simulation complete');
    } catch (e) {
      toast.error('Simulation failed: ' + (e?.message || 'error'));
      setResult(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      {/* Input */}
      <div className="rounded-[10px] border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <FlaskConical className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
          <div className="text-[12px] text-muted-foreground">
            <span className="font-semibold text-foreground">Advanced.</span> This tab evaluates a hypothetical config you paste below,
            not any published campaign. It runs entirely in your browser for what-if analysis.
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label htmlFor="whatif-config" className="text-[12px] font-medium">Config groups (JSON)</Label>
            <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-[12px]" onClick={loadSample}>
              <FlaskConical className="w-3.5 h-3.5" /> Sample
            </Button>
          </div>
          <Textarea
            id="whatif-config"
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            className="bg-background font-mono text-[12px] min-h-[300px] leading-relaxed"
            aria-invalid={configInvalid}
          />
          {configInvalid && (
            <p className="flex items-center gap-1.5 text-[11px] status-error mt-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Invalid JSON: {configParse.error}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="whatif-lead" className="text-[12px] font-medium">Test lead (JSON)</Label>
          <Textarea
            id="whatif-lead"
            value={leadText}
            onChange={(e) => setLeadText(e.target.value)}
            className="mt-1 bg-background font-mono text-[12px] min-h-[160px] leading-relaxed"
            aria-invalid={leadInvalid}
          />
          {leadInvalid && (
            <p className="flex items-center gap-1.5 text-[11px] status-error mt-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Invalid JSON: {leadParse.error}
            </p>
          )}
        </div>

        <Button onClick={run} disabled={configInvalid || leadInvalid} className="gap-1.5 w-full">
          <Play className="w-4 h-4" /> Run what-if simulation
        </Button>
      </div>

      {/* Output */}
      <div>
        {result ? (
          <SimulatorResult result={result} />
        ) : (
          <div className="rounded-[10px] border border-border bg-card p-10 text-center">
            <FlaskConical className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <div className="text-[13px] font-medium text-foreground">Run the what-if to see the routing decision</div>
            <div className="text-[12px] text-muted-foreground mt-1">
              Edit the hypothetical config and test lead, then run to trace the decision client-side.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
