import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { appParams } from '@/lib/app-params';
import { DISPOSITIONS } from '@/lib/dispositions';

function CopyRow({ label, value, mono = true }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0">
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className={`text-[13px] text-foreground mt-0.5 truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
      </div>
      <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-[11px] shrink-0" onClick={() => { navigator.clipboard.writeText(value); toast.success('Copied'); }}>
        <Copy className="w-3.5 h-3.5" /> Copy
      </Button>
    </div>
  );
}

export default function PortalSettings() {
  const { buyer } = useOutletContext();
  const base = appParams.appBaseUrl || window.location.origin;
  const webhookUrl = `${base}/functions/buyerFeedbackWebhook`;
  const token = buyer?.id || '';

  const sampleBody = JSON.stringify({
    phone: '(555) 123-4567',
    email: 'lead@example.com',
    disposition: 'Signed the client',
    notes: 'Attorney signed, strong case',
    outcome: 'Converted',
    revenue_value: 750,
  }, null, 2);

  const sampleCurl = `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-BUYER-TOKEN: ${token}" \\
  -d '${JSON.stringify({ phone: '(555) 123-4567', disposition: 'Signed the client', notes: 'Attorney signed' })}'`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Settings & API</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Post lead feedback to us automatically via the webhook below.</p>
      </div>

      <div className="bg-card border border-border rounded-[10px] p-5 mb-6">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your API Details</div>
        <CopyRow label="Feedback Webhook Endpoint" value={webhookUrl} />
        <CopyRow label="Your Buyer Token (send as X-BUYER-TOKEN)" value={token} />
      </div>

      <div className="bg-card border border-border rounded-[10px] p-5 mb-6">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">How to Post Feedback</div>
        <ul className="text-[13px] text-muted-foreground space-y-1.5 list-disc pl-5">
          <li>Send an HTTP <span className="font-mono text-foreground">POST</span> to the endpoint above.</li>
          <li>Authenticate with header <span className="font-mono text-foreground">X-BUYER-TOKEN</span> set to your buyer token.</li>
          <li>Match the lead by <span className="font-mono text-foreground">phone</span> and/or <span className="font-mono text-foreground">email</span> (at least one required).</li>
          <li>Send your own <span className="font-mono text-foreground">disposition</span> (any wording) plus optional <span className="font-mono text-foreground">notes</span>, <span className="font-mono text-foreground">outcome</span> and <span className="font-mono text-foreground">revenue_value</span>.</li>
          <li>We map your disposition to our standard taxonomy automatically and record a confidence score.</li>
        </ul>

        <div className="mt-4">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">Example request body</div>
          <pre className="bg-background border border-border rounded-lg p-3 text-[12px] font-mono text-foreground overflow-x-auto">{sampleBody}</pre>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">cURL</div>
            <Button size="sm" variant="ghost" className="h-6 px-2 gap-1 text-[11px]" onClick={() => { navigator.clipboard.writeText(sampleCurl); toast.success('Copied'); }}>
              <Copy className="w-3 h-3" /> Copy
            </Button>
          </div>
          <pre className="bg-background border border-border rounded-lg p-3 text-[12px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap">{sampleCurl}</pre>
        </div>
      </div>

      <div className="bg-card border border-border rounded-[10px] p-5">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Disposition Taxonomy</div>
        <p className="text-[13px] text-muted-foreground mb-3">Your free-text disposition is mapped to the closest of these values:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          {DISPOSITIONS.map(d => (
            <div key={d.value} className="flex items-start gap-2 py-1 border-b border-border/50">
              <span className="text-[13px] font-medium text-foreground shrink-0 w-36">{d.value}</span>
              <span className="text-[12px] text-muted-foreground">{d.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}