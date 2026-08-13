import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Copy, Eye, EyeOff, Check } from 'lucide-react';
import { toast } from 'sonner';
import { buildPostingSpec, specToken } from '@/lib/postingSpec';

function CopyBtn({ text, label = 'Copied' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); toast.success(label); setTimeout(() => setDone(false), 1200); }}
      className="text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {done ? <Check className="w-3.5 h-3.5 status-sold" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CodeBlock({ value, label }) {
  return (
    <div className="relative bg-muted/50 border border-border rounded-[8px] overflow-hidden">
      {label && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/60">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
          <CopyBtn text={value} label="Copied to clipboard" />
        </div>
      )}
      <pre className="p-3 text-[12px] font-mono text-foreground overflow-x-auto leading-relaxed">{value}</pre>
    </div>
  );
}

function FieldTable({ fields, emptyText }) {
  if (!fields || fields.length === 0) {
    return <p className="text-[13px] text-muted-foreground py-3">{emptyText}</p>;
  }
  return (
    <div className="border border-border rounded-[8px] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {['Field', 'Type', 'Required', 'Example'].map(h => (
              <th key={h} className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {fields.map(f => (
            <tr key={f.field_name} className="hover:bg-accent/40 transition-colors">
              <td className="px-3 py-2 font-mono text-[12px] text-foreground">{f.field_name}</td>
              <td className="px-3 py-2 text-muted-foreground">{f.type}</td>
              <td className="px-3 py-2">
                {f.required
                  ? <Badge variant="outline" className="text-[10px] status-error bg-status-error">Required</Badge>
                  : <Badge variant="outline" className="text-[10px] text-muted-foreground">Optional</Badge>}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground truncate max-w-[220px]">{String(f.example)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PostingSpecs({ supplier, apiKey, customFields, campaigns, verticals, buyers, baseUrl }) {
  const [token, setToken] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    let active = true;
    specToken(apiKey?.key || '').then(t => { if (active) setToken(t); });
    return () => { active = false; };
  }, [apiKey?.key]);

  if (!apiKey) {
    return (
      <div className="bg-card border border-border rounded-[10px] p-5">
        <p className="text-[13px] text-muted-foreground">This supplier has no API key yet. Create one on the API Keys settings page to generate a posting spec.</p>
      </div>
    );
  }

  const spec = buildPostingSpec({ supplier, key: apiKey, customFields, campaigns, verticals, buyers, baseUrl, token });
  const bodyJson = JSON.stringify(spec.example_body, null, 2);
  const curl = `curl -X POST '${spec.endpoint}' \\\n  -H 'X-API-KEY: ${apiKey.key}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(spec.example_body)}'`;

  return (
    <div className="space-y-6">
      {/* Endpoint + headers */}
      <div className="bg-card border border-border rounded-[10px] p-5 space-y-4">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Integration Endpoint</div>

        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-[12px] text-muted-foreground">Method</span>
          <Badge variant="outline" className="text-[11px] status-sold bg-status-sold font-mono">{spec.method}</Badge>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-border gap-3">
          <span className="text-[12px] text-muted-foreground shrink-0">URL</span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[12px] text-foreground truncate">{spec.endpoint}</span>
            <CopyBtn text={spec.endpoint} label="Endpoint copied" />
          </div>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-[12px] text-muted-foreground">Content-Type</span>
          <span className="font-mono text-[12px] text-foreground">application/json</span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-[12px] text-muted-foreground">X-API-KEY</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-foreground">{showKey ? apiKey.key : `${apiKey.key_prefix || apiKey.key?.slice(0, 12)}...`}</span>
            <button onClick={() => setShowKey(v => !v)} className="text-muted-foreground hover:text-foreground">
              {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <CopyBtn text={apiKey.key} label="API key copied" />
          </div>
        </div>
      </div>

      {/* Shareable spec URL */}
      <div className="bg-card border border-border rounded-[10px] p-5 space-y-2">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Shareable Posting Spec URL</div>
        <p className="text-[12px] text-muted-foreground">Send this to the supplier. It opens the full posting spec, endpoint, headers, fields and examples, without operator login.</p>
        <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-[8px] px-3 py-2">
          <span className="font-mono text-[12px] text-foreground truncate min-w-0">{spec.spec_url || 'Generating…'}</span>
          {spec.spec_url && <CopyBtn text={spec.spec_url} label="Spec URL copied" />}
        </div>
      </div>

      {/* Required fields */}
      <div className="bg-card border border-border rounded-[10px] p-5 space-y-3">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Required Fields</div>
        <p className="text-[12px] text-muted-foreground">These must be present for a lead to be accepted and eligible to sell.</p>
        <FieldTable fields={spec.required_fields} emptyText="No required fields configured." />
      </div>

      {/* Optional fields */}
      <div className="bg-card border border-border rounded-[10px] p-5 space-y-3">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Optional Fields</div>
        <FieldTable fields={spec.optional_fields} emptyText="No additional optional fields." />
      </div>

      {/* Example request */}
      <div className="bg-card border border-border rounded-[10px] p-5 space-y-3">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Example Request</div>
        <CodeBlock value={bodyJson} label="Request Body (JSON)" />
        <CodeBlock value={curl} label="cURL" />
      </div>

      {/* Example responses */}
      <div className="bg-card border border-border rounded-[10px] p-5 space-y-3">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Example Responses</div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="outline" className="text-[10px] status-sold bg-status-sold">Accepted &amp; Sold</Badge>
            </div>
            <CodeBlock value={JSON.stringify(spec.example_responses.accepted_sold, null, 2)} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="outline" className="text-[10px] status-unsold bg-status-unsold">Unsold</Badge>
            </div>
            <CodeBlock value={JSON.stringify(spec.example_responses.unsold, null, 2)} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Badge variant="outline" className="text-[10px] status-queued bg-status-queued">Queued</Badge>
            </div>
            <CodeBlock value={JSON.stringify(spec.example_responses.queued, null, 2)} />
          </div>
        </div>
      </div>
    </div>
  );
}