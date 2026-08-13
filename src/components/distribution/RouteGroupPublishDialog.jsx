import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import SimulatorResult from '@/components/distribution/SimulatorResult';
import {
  Play, Loader2, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, ArrowRight, Rocket,
} from 'lucide-react';

const LEAD_FIELDS = [
  { key: 'state', label: 'State', placeholder: 'CA' },
  { key: 'zip', label: 'ZIP', placeholder: '90210' },
  { key: 'county', label: 'County', placeholder: 'Los Angeles' },
  { key: 'vertical', label: 'Vertical', placeholder: 'mva' },
  { key: 'brand', label: 'Brand', placeholder: 'legenex' },
  { key: 'supplier', label: 'Supplier', placeholder: 'acme-media' },
  { key: 'source', label: 'Source', placeholder: 'paid-search' },
];

const SAMPLE_LEAD = { state: 'CA', zip: '90210', county: 'Los Angeles', vertical: 'mva', brand: 'legenex', supplier: 'acme-media', source: 'paid-search' };
const EMPTY_LEAD = LEAD_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {});

const DIFF_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'method', label: 'Method' },
  { key: 'order_index', label: 'Order index' },
  { key: 'price_weight', label: 'Price weight' },
  { key: 'priority_weight', label: 'Priority weight' },
  { key: 'active', label: 'Active' },
];

function fmt(v) {
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (v == null || v === '') return '(empty)';
  return String(v);
}

// Extract the { ok:false, errors } payload a 422 publish response may carry,
// whether the SDK resolves it or throws it.
function extractErrorPayload(e) {
  const data = e?.response?.data || e?.data || e?.body;
  if (data && data.ok === false) return data;
  return null;
}

// Publish flow: validate -> simulate -> diff + reason -> publish. Publish stays
// disabled until validation passes, at least one simulation succeeds, and a
// change reason is entered.
export default function RouteGroupPublishDialog({ open, onOpenChange, group, formValues, memberCount, onPublished }) {
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null); // { valid, errors, configHash }

  const [lead, setLead] = useState(SAMPLE_LEAD);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [simPassed, setSimPassed] = useState(false);

  const [changeReason, setChangeReason] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishErrors, setPublishErrors] = useState(null);
  const [published, setPublished] = useState(null); // { config_version_id, config_hash }

  const runValidate = async () => {
    setValidating(true);
    try {
      const res = await base44.functions.invoke('distributionConfig', {
        action: 'validate',
        route_group_id: group.id,
      });
      setValidation(res?.data || { valid: false, errors: ['No response from validator'] });
    } catch (e) {
      setValidation({ valid: false, errors: [e?.message || 'Validation request failed'] });
    }
    setValidating(false);
  };

  // Reset and validate each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setValidation(null);
    setLead(SAMPLE_LEAD);
    setSimResult(null);
    setSimPassed(false);
    setChangeReason('');
    setPublishErrors(null);
    setPublished(null);
    runValidate();
  }, [open, group?.id]);

  const diff = useMemo(() => {
    const rows = [];
    for (const f of DIFF_FIELDS) {
      const next = formValues?.[f.key];
      const prev = group?.[f.key];
      const a = fmt(prev);
      const b = fmt(next);
      if (a !== b) rows.push({ label: f.label, from: a, to: b });
    }
    return rows;
  }, [formValues, group]);

  const runSimulate = async () => {
    setSimulating(true);
    setSimResult(null);
    setSimPassed(false);
    try {
      const cleanLead = {};
      for (const { key } of LEAD_FIELDS) {
        const v = String(lead[key] ?? '').trim();
        if (v !== '') cleanLead[key] = v;
      }
      const res = await base44.functions.invoke('distributionSimulate', {
        campaign_id: group.campaign_id,
        lead: cleanLead,
      });
      const data = res?.data || {};
      setSimResult(data);
      const configErrors = Array.isArray(data.configErrors) ? data.configErrors : (data.configErrors ? [data.configErrors] : []);
      const clean = configErrors.length === 0;
      setSimPassed(clean);
      if (clean) toast.success('Simulation succeeded');
      else toast.error('Simulation returned config errors');
    } catch (e) {
      toast.error('Simulation failed: ' + (e?.message || 'error'));
      setSimResult(null);
      setSimPassed(false);
    }
    setSimulating(false);
  };

  const valid = validation?.valid === true;
  const reasonOk = changeReason.trim().length > 0;
  const canPublish = valid && simPassed && reasonOk && !publishing && !published;

  const doPublish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    setPublishErrors(null);
    try {
      const res = await base44.functions.invoke('distributionConfig', {
        action: 'publish',
        route_group_id: group.id,
        change_reason: changeReason.trim(),
        config_hash: validation?.configHash,
      });
      const data = res?.data || {};
      if (data.ok === false) {
        setPublishErrors(Array.isArray(data.errors) ? data.errors : [String(data.errors || 'Publish rejected')]);
      } else {
        setPublished(data);
        toast.success('Configuration published');
        onPublished?.(data);
      }
    } catch (e) {
      const payload = extractErrorPayload(e);
      if (payload) {
        setPublishErrors(Array.isArray(payload.errors) ? payload.errors : [String(payload.errors || 'Publish rejected')]);
      } else {
        toast.error('Publish failed: ' + (e?.message || 'error'));
      }
    }
    setPublishing(false);
  };

  const setLeadField = (key, v) => setLead((l) => ({ ...l, [key]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border max-w-[860px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish {group?.name}</DialogTitle>
          <DialogDescription className="text-[12px]">
            Validate the draft, run at least one simulation, review the diff, then confirm with a change reason.
          </DialogDescription>
        </DialogHeader>

        {published ? (
          <div className="rounded-[10px] border border-primary/40 bg-primary/[0.12] p-6 text-center space-y-3">
            <ShieldCheck className="w-9 h-9 text-primary mx-auto" />
            <div className="text-[15px] font-semibold text-foreground">Configuration published</div>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="uppercase tracking-wide text-muted-foreground/70">Version</span>
                <span className="font-mono font-semibold text-foreground">{String(published.config_version_id ?? '--')}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="uppercase tracking-wide text-muted-foreground/70">Config hash</span>
                <span className="font-mono font-semibold text-foreground">{String(published.config_hash ?? '--')}</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Step 1: Validation */}
            <section className="rounded-[10px] border border-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">1. Validation</div>
                {validating ? (
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking</Badge>
                ) : valid ? (
                  <Badge className="bg-status-sold status-sold border-0 text-[10px] gap-1"><CheckCircle2 className="w-3 h-3" /> Valid</Badge>
                ) : validation ? (
                  <Badge className="bg-status-error status-error border-0 text-[10px] gap-1"><XCircle className="w-3 h-3" /> Invalid</Badge>
                ) : null}
              </div>
              {!valid && validation && Array.isArray(validation.errors) && validation.errors.length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5">
                  {validation.errors.map((err, i) => (
                    <li key={i} className="text-[13px] status-error">{typeof err === 'string' ? err : (err?.message || JSON.stringify(err))}</li>
                  ))}
                </ul>
              )}
              {valid && validation?.configHash && (
                <p className="text-[12px] text-muted-foreground">Config hash <span className="font-mono text-foreground">{String(validation.configHash)}</span></p>
              )}
              <Button size="sm" variant="outline" onClick={runValidate} disabled={validating} className="gap-1.5">
                {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Re-run validation
              </Button>
            </section>

            {/* Step 2: Simulation */}
            <section className="rounded-[10px] border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">2. Simulation</div>
                {simPassed ? (
                  <Badge className="bg-status-sold status-sold border-0 text-[10px] gap-1"><CheckCircle2 className="w-3 h-3" /> Passed</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">Required</Badge>
                )}
              </div>
              <p className="text-[12px] text-muted-foreground">Runs against this campaign live config with no side effects. At least one clean run is required to publish.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {LEAD_FIELDS.map((f) => (
                  <div key={f.key}>
                    <Label htmlFor={`pub-lead-${f.key}`} className="text-[12px] font-medium">{f.label}</Label>
                    <Input
                      id={`pub-lead-${f.key}`}
                      value={lead[f.key]}
                      onChange={(e) => setLeadField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="mt-1 bg-background text-[13px]"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={runSimulate} disabled={simulating} className="gap-1.5">
                  {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  {simulating ? 'Simulating...' : 'Run simulation'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setLead(EMPTY_LEAD)} disabled={simulating}>Clear</Button>
              </div>
              {simResult && <SimulatorResult result={simResult} />}
            </section>

            {/* Step 3: Diff */}
            <section className="rounded-[10px] border border-border bg-card p-5 space-y-3">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">3. Config diff</div>
              {diff.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No group field changes since the last saved values. Publishing the current draft configuration with {memberCount} member{memberCount === 1 ? '' : 's'}.</p>
              ) : (
                <div className="space-y-1.5">
                  {diff.map((row) => (
                    <div key={row.label} className="flex items-center gap-2 text-[13px]">
                      <span className="w-32 shrink-0 text-muted-foreground">{row.label}</span>
                      <span className="font-mono text-muted-foreground line-through">{row.from}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <span className="font-mono text-foreground">{row.to}</span>
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground pt-1">Publishing with {memberCount} member{memberCount === 1 ? '' : 's'}.</p>
                </div>
              )}
            </section>

            {/* Step 4: Reason */}
            <section className="rounded-[10px] border border-border bg-card p-5 space-y-2">
              <Label htmlFor="change-reason" className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">4. Change reason</Label>
              <Textarea
                id="change-reason"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Describe what changed and why (required)"
                className="bg-background text-[13px] min-h-[70px]"
              />
              {!reasonOk && <p className="text-[11px] text-muted-foreground">A change reason is required to publish.</p>}
            </section>

            {publishErrors && publishErrors.length > 0 && (
              <div className="rounded-[10px] border border-status-error bg-status-error p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle className="w-4 h-4 status-error" />
                  <div className="text-[12px] font-semibold uppercase tracking-wider status-error">Publish rejected</div>
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {publishErrors.map((err, i) => (
                    <li key={i} className="text-[13px] status-error">{typeof err === 'string' ? err : (err?.message || JSON.stringify(err))}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {published ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={doPublish} disabled={!canPublish} className="gap-1.5">
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                Publish configuration
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
