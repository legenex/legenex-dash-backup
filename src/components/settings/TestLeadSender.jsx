import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import JsonViewer from '@/components/shared/JsonViewer';
import { Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_TEST_PAYLOAD = {
  firstname: 'Test',
  lastname: 'Lead',
  phone: '0000000000',
  email: 'test@legenex.com',
  sid: 'test',
  address: '123 Test St',
  city: 'Testville',
  state: 'TX',
  zip: '00000',
  ip_address: '127.0.0.1',
  country: 'US',
  s1: 'test_subid1',
  s2: 'test_subid2',
  s3: 'test_subid3',
  tier: '1',
  source: 'test_source',
  optin_url: 'https://example.com/optin',
  user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  utm_source: 'test_utm',
  utm_campaign: 'test_campaign',
  utm_medium: 'cpc',
  accident_date: '2024-01-15',
  accident_state: 'TX',
  accident_type: 'car',
  injury_type: 'whiplash',
  treatment: 'yes',
  fault: 'not_my_fault',
  insurance: 'yes',
  police_report: 'yes',
  has_attorney: 'No',
};

export default function TestLeadSender() {
  const [payloadStr, setPayloadStr] = useState(JSON.stringify(DEFAULT_TEST_PAYLOAD, null, 2));
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);

  const sendTest = async () => {
    setSending(true);
    setResult(null);
    try {
      let parsed;
      try {
        parsed = JSON.parse(payloadStr);
      } catch (e) {
        toast.error('Invalid JSON in payload');
        setSending(false);
        return;
      }

      const resp = await fetch('/functions/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test',
        },
        body: JSON.stringify(parsed),
      });

      const data = await resp.json();
      setResult({
        status: resp.status,
        ok: resp.ok,
        response: data,
        timestamp: new Date().toISOString(),
      });

      if (resp.ok) {
        toast.success('Test lead sent successfully');
      } else {
        toast.error(`Failed: ${data.error || resp.statusText}`);
      }
    } catch (err) {
      setResult({ error: err.message, timestamp: new Date().toISOString() });
      toast.error('Network error');
    }
    setSending(false);
  };

  return (
    <div className="space-y-4">
      <div className="text-[13px] text-muted-foreground leading-relaxed bg-card border border-border rounded-lg p-4">
        <p className="font-medium text-foreground mb-1">Test Lead Sender</p>
        <p>Send a test lead through the live <code className="bg-muted px-1 rounded text-primary text-[11px]">/functions/leads</code> endpoint. Edit the payload below to test different scenarios.</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px]">Test Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="text-[12px]">JSON Payload</Label>
          <Textarea
            value={payloadStr}
            onChange={e => setPayloadStr(e.target.value)}
            className="bg-background font-mono text-[12px] min-h-[400px] leading-relaxed mt-1"
          />
          <div className="flex items-center gap-3 mt-4">
            <Button onClick={sendTest} disabled={sending} className="gap-1.5">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Send Test Lead
            </Button>
            <Button
              variant="outline"
              onClick={() => setPayloadStr(JSON.stringify(DEFAULT_TEST_PAYLOAD, null, 2))}
              disabled={sending}
            >
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] flex items-center gap-2">
              Result
              <Badge className={result.ok ? 'bg-status-sold text-green-400' : 'bg-status-error text-red-400'}>
                {result.ok ? 'Success' : result.error ? 'Error' : 'Failed'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer data={result} title="Response" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}