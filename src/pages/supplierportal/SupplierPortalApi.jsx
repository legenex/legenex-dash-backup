import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { appParams } from '@/lib/app-params';

const PAYLOAD_FIELDS = [
  ['first_name', 'string', 'Lead first name'],
  ['last_name', 'string', 'Lead last name'],
  ['mobile', 'string', 'Contact phone number'],
  ['email', 'string', 'Contact email address'],
  ['vertical', 'string', 'Vertical code the lead belongs to'],
  ['state', 'string', 'Lead state / region (if applicable)'],
  ['trusted_form_cert_url', 'string', 'TrustedForm certificate URL, if collected'],
];

function CopyRow({ label, value, mono = true, masked = false }) {
  const [show, setShow] = useState(false);
  const display = masked && !show ? '••••••••••••••••' : value;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0">
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className={`text-[13px] text-foreground mt-0.5 truncate ${mono ? 'font-mono' : ''}`}>{display}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {masked && (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShow(v => !v)}>
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-[11px]" onClick={() => { navigator.clipboard.writeText(value); toast.success('Copied'); }}>
          <Copy className="w-3.5 h-3.5" /> Copy
        </Button>
      </div>
    </div>
  );
}

export default function SupplierPortalApi() {
  const { data, supplier } = useOutletContext();
  const apiKey = data?.apiKey || null;
  const base = appParams.appBaseUrl || window.location.origin;
  const endpoint = `${base}/functions/leads`;
  const key = apiKey?.key || 'YOUR_API_KEY';

  const sampleBody = JSON.stringify({
    first_name: 'Jane',
    last_name: 'Doe',
    mobile: '(555) 123-4567',
    email: 'jane@example.com',
    vertical: supplier?.vertical || 'mva',
    state: 'CA',
  }, null, 2);

  const sampleCurl = `curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: ${key}" \\
  -d '${JSON.stringify({ first_name: 'Jane', last_name: 'Doe', mobile: '(555) 123-4567', email: 'jane@example.com', vertical: supplier?.vertical || 'mva' })}'`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">API Specs</h1>
        <p className="text-[13px] text-muted-foreground mt-1">How to post leads to us, your endpoint, key and payload format.</p>
      </div>

      <div className="bg-card border border-border rounded-[10px] p-5 mb-6">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Ingest Details</div>
        <CopyRow label="Ingest Endpoint (POST)" value={endpoint} />
        {apiKey ? (
          <CopyRow label="Your API Key (send as X-API-KEY)" value={apiKey.key} masked />
        ) : (
          <div className="py-2.5 text-[13px] text-muted-foreground">No API key issued yet. Contact us to get one.</div>
        )}
      </div>

      <div className="bg-card border border-border rounded-[10px] p-5 mb-6">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Expected Payload Fields</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[480px]">
            <thead>
              <tr className="border-b border-border">
                {['Field', 'Type', 'Description'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PAYLOAD_FIELDS.map(([f, t, d]) => (
                <tr key={f}>
                  <td className="px-3 py-2 font-mono text-[12px] text-foreground">{f}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-muted-foreground">{t}</td>
                  <td className="px-3 py-2 text-[12px] text-muted-foreground">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-border rounded-[10px] p-5">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Example Requests</div>

        <div className="mb-4">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">Request body</div>
          <pre className="bg-background border border-border rounded-lg p-3 text-[12px] font-mono text-foreground overflow-x-auto">{sampleBody}</pre>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">cURL</div>
            <Button size="sm" variant="ghost" className="h-6 px-2 gap-1 text-[11px]" onClick={() => { navigator.clipboard.writeText(sampleCurl); toast.success('Copied'); }}>
              <Copy className="w-3 h-3" /> Copy
            </Button>
          </div>
          <pre className="bg-background border border-border rounded-lg p-3 text-[12px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap">{sampleCurl}</pre>
        </div>
      </div>
    </div>
  );
}