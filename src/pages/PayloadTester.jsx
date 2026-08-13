import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ToolsShell from '@/components/tools/ToolsShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import JsonViewer from '@/components/shared/JsonViewer';
import { Play, Copy, Loader2, FlaskConical, CheckCircle2, XCircle, CircleDot } from 'lucide-react';
import { toast } from 'sonner';
import { sendPayloadTest } from '@/functions/sendPayloadTest';

const LEADS_ENDPOINT = 'https://api.legenex.com/functions/leads';

const SAMPLE_LEAD = `{
  "api_key": "PASTE_A_REAL_API_KEY_HERE",
  "firstName": "John",
  "lastName": "Smith",
  "email": "john.smith@example.com",
  "phoneMobile": "5551234567",
  "shippingState": "CA",
  "incidentDate": "2024-06-15",
  "synopsis": "Rear-end collision at intersection",
  "caseType": "Automobile Accident",
  "vertical": "mva",
  "optin_url": "https://example.com/lp/auto"
}`;

// Build a readable hop-by-hop trace from the pipeline response envelope.
function buildTrace(res) {
  if (!res) return [];
  const body = res.body || {};
  const hops = [];

  hops.push({
    name: 'Intake',
    ok: res.ok && body.acceptance !== 'unauthorized' && body.code !== 'BAD_KEY',
    detail: body.acceptance === 'unauthorized' || body.code === 'BAD_KEY'
      ? (body.reason || 'Rejected at intake')
      : `Accepted (HTTP ${res.status})`,
  });

  if (body.acceptance !== 'unauthorized' && body.code !== 'BAD_KEY') {
    if (body.lead_id != null || body.acceptance) {
      hops.push({ name: 'Validation & mapping', ok: body.lead_status !== 'rejected', detail: body.reason || body.message || 'Fields mapped' });
    }
    if ('phone_verified' in body || body.hlr_status) {
      hops.push({ name: 'Phone HLR', ok: true, detail: body.hlr_status || 'Lookup ran' });
    }
    hops.push({
      name: 'Distribution',
      ok: body.sold === true || body.lead_status === 'Qualified' || res.ok,
      detail: body.sold ? 'Sold' : (body.lead_status || 'Processed'),
    });
    hops.push({
      name: 'Response',
      ok: res.ok,
      detail: `${body.lead_status || 'done'}${body.revenue != null ? ` - $${body.revenue}` : ''}`,
    });
  }

  return hops;
}

export default function PayloadTester() {
  const qc = useQueryClient();
  const { data: tests = [] } = useQuery({
    queryKey: ['payloadTests'],
    queryFn: () => base44.entities.PayloadTest.list('-updated_date', 100),
  });

  const [targetUrl, setTargetUrl] = useState(LEADS_ENDPOINT);
  const [payload, setPayload] = useState(SAMPLE_LEAD);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const loadSample = () => {
    setPayload(SAMPLE_LEAD);
    setResult(null);
  };

  const copyPayload = () => {
    navigator.clipboard.writeText(payload);
    toast.success('Payload copied');
  };

  // Runs the synthetic lead through the real processLead pipeline. sendPayloadTest
  // behavior is preserved exactly: it POSTs { target_url, payload } and nothing else changes.
  const run = async () => {
    if (!targetUrl) { toast.error('Enter a target endpoint'); return; }
    if (!payload) { toast.error('Add a payload first'); return; }
    setRunning(true); setResult(null);
    try {
      const resp = await sendPayloadTest({ target_url: targetUrl, payload });
      setResult(resp.data);
      // Persist the run so telemetry "last test run" stays real.
      try {
        await base44.entities.PayloadTest.create({
          name: `Pipeline run ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
          target_url: targetUrl,
          payload_template: payload,
          test_data: '',
        });
        qc.invalidateQueries({ queryKey: ['payloadTests'] });
        qc.invalidateQueries({ queryKey: ['tools-telemetry'] });
      } catch (e) { /* logging is best-effort */ }

      if (resp.data?.ok) toast.success(`Pipeline responded ${resp.data.status}`);
      else toast.error(`Pipeline responded ${resp.data?.status || ''} ${resp.data?.statusText || ''}`);
    } catch (e) {
      setResult({ error: e.message });
      toast.error('Run failed: ' + (e.message || 'error'));
    }
    setRunning(false);
  };

  const trace = buildTrace(result);

  return (
    <ToolsShell
      title="Payload Tester"
      subtitle="Fire a synthetic lead through the full pipeline and inspect every hop."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Test Payload */}
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="text-[13px] font-semibold text-foreground mb-3">Test Payload</div>

          <div className="mb-3">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Endpoint</Label>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="font-mono text-[10px] shrink-0">POST</Badge>
              <Input
                value={targetUrl}
                onChange={e => setTargetUrl(e.target.value)}
                className="bg-background font-mono text-[12px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-1">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Lead JSON</Label>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-[12px]" onClick={copyPayload}>
                <Copy className="w-3.5 h-3.5" /> Copy
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-[12px]" onClick={loadSample}>
                <FlaskConical className="w-3.5 h-3.5" /> Sample
              </Button>
            </div>
          </div>
          <Textarea
            value={payload}
            onChange={e => setPayload(e.target.value)}
            className="bg-background font-mono text-[12px] min-h-[320px] leading-relaxed"
          />

          <Button onClick={run} disabled={running} className="gap-1.5 w-full mt-3">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Running...' : 'Run through pipeline'}
          </Button>
        </div>

        {/* Pipeline Trace */}
        <div className="rounded-[10px] border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-semibold text-foreground">Pipeline Trace</div>
            {result && !result.error && (
              <Badge className={result.ok ? 'bg-status-sold status-sold' : 'bg-status-error status-error'}>
                {result.ok ? 'Success' : 'Failed'} {result.status ? `· ${result.status}` : ''}
              </Badge>
            )}
          </div>

          {!result ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CircleDot className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <div className="text-[13px] font-medium text-foreground">Run the payload to see each hop</div>
              <div className="text-[12px] text-muted-foreground mt-1">The full intake, verification and distribution trace appears here.</div>
            </div>
          ) : result.error ? (
            <div className="rounded-lg border border-status-error bg-status-error p-3 text-[13px] status-error">{result.error}</div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-0">
                {trace.map((hop, i) => (
                  <div key={i} className="flex items-start gap-3 relative pb-4 last:pb-0">
                    {i < trace.length - 1 && <div className="absolute left-[9px] top-5 bottom-0 w-px bg-border" />}
                    <div className="relative z-10 shrink-0 mt-0.5">
                      {hop.ok
                        ? <CheckCircle2 className="w-[18px] h-[18px] status-sold" />
                        : <XCircle className="w-[18px] h-[18px] status-error" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground">{hop.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{hop.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Raw response</div>
                <JsonViewer data={result.body ?? result} title="Pipeline response" />
              </div>
            </div>
          )}
        </div>
      </div>
    </ToolsShell>
  );
}