import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { integrationStatus as fetchIntegrationStatus } from '@/functions/integrationStatus';
import { sendWhatsapp } from '@/functions/sendWhatsapp';
import { sendGmail } from '@/functions/sendGmail';
import { syncMercury } from '@/functions/syncMercury';
import { syncStripe } from '@/functions/syncStripe';
import { syncXero } from '@/functions/syncXero';
import ApiKeyConnectDialog from '@/components/settings/ApiKeyConnectDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Mail, FileSpreadsheet, Hash, CheckCircle2, Plug, Zap, ShieldAlert,
  Send, Save, Facebook, ShieldCheck,
  CreditCard, Receipt, Settings2, Landmark, Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import MetaConnectDialog from '@/components/settings/MetaConnectDialog';
import MetaManageDialog from '@/components/settings/MetaManageDialog';
import GoogleSheetsManageDialog from '@/components/settings/GoogleSheetsManageDialog';
import { metaConnectionStatus } from '@/functions/metaConnectionStatus';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'ads', label: 'Ad Platforms' },
  { key: 'delivery', label: 'Lead Delivery' },
  { key: 'notify', label: 'Notifications & Reports' },
  { key: 'billing', label: 'Financial' },
  { key: 'validation', label: 'Lead Validation' },
];

// category-tagged integration catalog. `meta` opens the Meta connect/manage dialogs.
const CATALOG = [
  { type: 'meta', category: 'ads', name: 'Meta (Facebook) Ads', icon: Facebook, desc: 'Sync ad spend & map to campaigns for true CPL', live: 'meta' },

  { type: 'googlesheets', category: 'delivery', name: 'Google Sheets', icon: FileSpreadsheet, desc: 'Read spreadsheets into leads, feedback, calls and cost', supported: true, oauth: true, sheets: true },

  { type: 'slack', category: 'notify', name: 'Slack', icon: Hash, desc: 'Channel notifications & alerts', supported: true, oauth: true },
  { type: 'gmail', category: 'notify', name: 'Gmail', icon: Mail, desc: 'Send & receive email notifications', supported: true, gmail: true },

  { type: 'stripe', category: 'billing', name: 'Stripe', icon: CreditCard, desc: 'Buyer payments & subscription billing', supported: true, apiKey: true },
  { type: 'xero', category: 'billing', name: 'Xero', icon: Receipt, desc: 'Sync invoices & payments to Xero', supported: true, apiKey: true },
  { type: 'mercury', category: 'billing', name: 'Mercury', icon: Landmark, desc: 'Bank feed sync into transactions for reconciliation', supported: true, apiKey: true },
  { type: 'rebrandly', category: 'delivery', name: 'Rebrandly', icon: Link2, desc: 'Branded short links for buyer onboarding', supported: true, apiKey: true },

  { type: 'trustedform', category: 'validation', name: 'TrustedForm', icon: ShieldCheck, desc: 'Cert validation passthrough on inbound leads', link: '/verification', action: 'Configure' },
];

// API-key based connectors: dialog field + verify/sync wiring per service.
const API_KEY_CONNECTORS = {
  mercury: {
    title: 'Mercury', description: 'Paste your Mercury API token to pull bank transactions live into reconciliation.',
    syncFn: syncMercury, syncLabel: 'Sync transactions',
    fields: [
      { key: 'api_token', label: 'Mercury API Token', placeholder: 'secret-token-...', secret: true, help: 'Create a read token in Mercury Settings > API tokens with read access to transactions.' },
      { key: 'account_id', label: 'Account ID', placeholder: 'Leave blank to sync all accounts', optional: true },
    ],
  },
  stripe: {
    title: 'Stripe', description: 'Paste your Stripe secret key to sync balance transactions and buyer payments.',
    verifyFn: syncStripe, syncFn: syncStripe, syncLabel: 'Sync payments',
    fields: [
      { key: 'secret_key', label: 'Stripe Secret Key', placeholder: 'sk_live_... or rk_live_...', secret: true, help: 'Use a restricted key with read access to Balance and Charges. Found in Stripe Dashboard > Developers > API keys.' },
    ],
  },
  xero: {
    title: 'Xero', description: 'Paste a Xero OAuth2 access token to sync invoices and payments.',
    verifyFn: syncXero, syncFn: syncXero, syncLabel: 'Sync invoices',
    fields: [
      { key: 'access_token', label: 'Xero Access Token', placeholder: 'eyJ...', secret: true, help: 'Generate an access token from your Xero app (Custom Connection) with accounting.transactions and accounting.contacts read scopes.' },
      { key: 'tenant_id', label: 'Tenant ID', placeholder: 'Auto-resolved from your token if blank', optional: true },
    ],
  },
  rebrandly: {
    title: 'Rebrandly', description: 'Paste your Rebrandly API key to generate branded short links during buyer onboarding.',
    fields: [
      { key: 'api_key', label: 'Rebrandly API Key', placeholder: 'Your Rebrandly API key', secret: true, help: 'Found in Rebrandly > Account Settings > API keys.' },
    ],
  },
};

export default function SettingsIntegrations() {
  const qc = useQueryClient();
  const [cat, setCat] = useState('all');
  const [pending, setPending] = useState(null);
  const [apiKeyType, setApiKeyType] = useState(null);

  const [waOpen, setWaOpen] = useState(false);
  const [waForm, setWaForm] = useState({ access_token: '', phone_number_id: '' });
  const [waTest, setWaTest] = useState({ to: '', body: 'Test from Legenex' });
  const [waSaving, setWaSaving] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [waLoading, setWaLoading] = useState(false);

  const [gmOpen, setGmOpen] = useState(false);
  const [gmFrom, setGmFrom] = useState('');
  const [gmTest, setGmTest] = useState({ to: '', subject: 'Test from Legenex', body: 'This is a test email sent from Legenex.' });
  const [gmSending, setGmSending] = useState(false);
  const [gmLoading, setGmLoading] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['integration-status'],
    queryFn: () => fetchIntegrationStatus({}),
  });
  const statusMap = data?.data?.status || data?.status || {};

  const openWhatsapp = async () => {
    setWaOpen(true); setWaLoading(true);
    try {
      const list = await base44.entities.IntegrationConfig.filter({ name: 'whatsapp' });
      const cfg = list[0];
      if (cfg) { const p = JSON.parse(cfg.config || '{}'); setWaForm({ access_token: p.access_token || '', phone_number_id: p.phone_number_id || '' }); }
      else setWaForm({ access_token: '', phone_number_id: '' });
    } catch { setWaForm({ access_token: '', phone_number_id: '' }); }
    setWaLoading(false);
  };

  const saveWhatsapp = async () => {
    if (!waForm.access_token?.trim() || !waForm.phone_number_id?.trim()) { toast.error('Access token and Phone Number ID are required'); return; }
    setWaSaving(true);
    try {
      const list = await base44.entities.IntegrationConfig.filter({ name: 'whatsapp' });
      const payload = JSON.stringify(waForm);
      if (list[0]) await base44.entities.IntegrationConfig.update(list[0].id, { config: payload });
      else await base44.entities.IntegrationConfig.create({ name: 'whatsapp', config: payload });
      toast.success('WhatsApp credentials saved');
      qc.invalidateQueries({ queryKey: ['integration-status'] }); refetch();
    } catch { toast.error('Failed to save credentials'); }
    setWaSaving(false);
  };

  const sendTest = async () => {
    if (!waTest.to?.trim() || !waTest.body?.trim()) { toast.error('Enter a number and a message'); return; }
    setWaSending(true);
    try {
      const res = await sendWhatsapp({ to: waTest.to, body: waTest.body });
      const d = res?.data || {};
      if (d.success) toast.success('WhatsApp message sent'); else toast.error(d.error || 'Send failed');
    } catch (e) { toast.error(e?.response?.data?.error || 'Send failed'); }
    setWaSending(false);
  };

  const openGmail = async () => {
    setGmOpen(true); setGmLoading(true); setGmFrom('');
    try { const res = await sendGmail({}); const d = res?.data || {}; if (d.connected) setGmFrom(d.from || ''); }
    catch { setGmFrom(''); }
    setGmLoading(false);
  };

  const sendGmailTest = async () => {
    if (!gmTest.to?.trim()) { toast.error('Enter a recipient email address'); return; }
    setGmSending(true);
    try {
      const res = await sendGmail({ to: gmTest.to, subject: gmTest.subject, body: gmTest.body });
      const d = res?.data || {};
      if (d.success) { toast.success(`Email sent from ${d.from || 'Gmail'}`); if (d.from) setGmFrom(d.from); }
      else toast.error(d.error || 'Send failed');
    } catch (e) { toast.error(e?.response?.data?.error || 'Send failed - is Gmail connected?'); }
    setGmSending(false);
  };

  const handleConnect = (it) => {
    if (it.sheets) return setSheetsManageOpen(true);
    if (it.type === 'whatsapp') return openWhatsapp();
    if (it.gmail) return openGmail();
    if (it.link) { window.location.href = it.link; return; }
    if (it.apiKey && API_KEY_CONNECTORS[it.type]) { setApiKeyType(it.type); return; }
    setPending(it);
  };

  const visible = CATALOG.filter(it => cat === 'all' || it.category === cat);
  const [metaConnectOpen, setMetaConnectOpen] = useState(false);
  const [metaManageOpen, setMetaManageOpen] = useState(false);
  const [sheetsManageOpen, setSheetsManageOpen] = useState(false);
  const { data: metaStatus } = useQuery({ queryKey: ['meta-connection-status'], queryFn: async () => (await metaConnectionStatus({})).data });
  const metaConnected = (metaStatus?.connections?.length || 0) > 0;

  return (
    <div>
      <div className="text-[13px] text-muted-foreground mb-4 max-w-2xl">
        Connect the external services powering ad spend, lead delivery, notifications, billing and validation.
      </div>

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setCat(c.key)}
            className={`text-[12px] px-3 py-1.5 rounded-full border transition-colors ${cat === c.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((it) => {
          const Icon = it.icon;
          const connected = it.live === 'meta' ? metaConnected : (it.supported ? !!statusMap[it.type] : false);
          return (
            <div key={it.type} className={`bg-card border border-border rounded-[12px] p-4 flex flex-col ${it.comingSoon ? 'opacity-80' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-primary" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-[14px] font-semibold text-foreground">{it.name}</div>
                    {it.comingSoon && <Badge variant="outline" className="text-[10px] text-muted-foreground">Coming soon</Badge>}
                  </div>
                  <div className="text-[12px] text-muted-foreground mt-0.5">{it.desc}</div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4">
                {it.comingSoon ? (
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Not available</span>
                ) : it.link ? (
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Settings2 className="w-3.5 h-3.5" /> In-app</span>
                ) : isLoading ? (
                  <span className="text-[11px] text-muted-foreground">Checking…</span>
                ) : connected ? (
                  <span className="text-[11px] status-sold inline-flex items-center gap-1 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Connected</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> Not connected</span>
                )}

                {it.comingSoon ? (
                  <Button size="sm" variant="outline" disabled className="gap-1.5 opacity-60"><Plug className="w-3.5 h-3.5" /> Connect</Button>
                ) : (
                  <Button size="sm" variant={connected ? 'outline' : 'default'} className="gap-1.5" onClick={() => it.live === 'meta' ? (metaConnected ? setMetaManageOpen(true) : setMetaConnectOpen(true)) : handleConnect(it)}>
                    {it.action || (connected ? 'Manage' : <><Plug className="w-3.5 h-3.5" /> Connect</>)}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Meta connector dialogs */}
      <MetaConnectDialog open={metaConnectOpen} onOpenChange={setMetaConnectOpen} onConnected={() => qc.invalidateQueries({ queryKey: ['meta-connection-status'] })} />
      <MetaManageDialog open={metaManageOpen} onOpenChange={setMetaManageOpen} />

      {/* Google Sheets: account, permissions and the sheets reading through it */}
      <GoogleSheetsManageDialog open={sheetsManageOpen} onOpenChange={setSheetsManageOpen} />

      {/* API-key connectors (Mercury, Stripe, Xero) */}
      {apiKeyType && (
        <ApiKeyConnectDialog
          open={!!apiKeyType}
          onOpenChange={(o) => { if (!o) { setApiKeyType(null); refetch(); } }}
          name={apiKeyType}
          {...API_KEY_CONNECTORS[apiKeyType]}
        />
      )}

      {/* OAuth connect info dialog */}
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="bg-popover border-border max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{pending && statusMap[pending.type] ? 'Manage' : 'Connect'} {pending?.name}</DialogTitle>
            <DialogDescription>{pending?.desc}</DialogDescription>
          </DialogHeader>
          {pending && statusMap[pending.type] ? (
            <div className="flex items-center gap-2 text-[13px]">
              <CheckCircle2 className="w-4 h-4 status-sold" />
              <span className="status-sold font-medium">Connected</span>
              <span className="text-muted-foreground">· {pending?.name} is linked and active.</span>
            </div>
          ) : (
            <div className="text-[13px] text-muted-foreground leading-relaxed">
              Connecting <span className="text-foreground font-medium">{pending?.name}</span> opens an OAuth grant so you can link your account and pick resources.
              This needs a one-time connector setup, tell me in chat to enable the {pending?.name} connect flow and I'll wire it up.
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>Close</Button>
            <Button onClick={() => { setPending(null); refetch(); qc.invalidateQueries({ queryKey: ['integration-status'] }); }}><Plug className="w-4 h-4" /> Refresh status</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gmail management */}
      <Dialog open={gmOpen} onOpenChange={setGmOpen}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Manage Gmail</DialogTitle>
            <DialogDescription>Send a test email from your connected Gmail account.</DialogDescription>
          </DialogHeader>
          {gmLoading ? (
            <div className="py-6 text-center text-muted-foreground text-[13px]">Loading…</div>
          ) : gmFrom ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[12px]">
                <CheckCircle2 className="w-4 h-4 status-sold" /><span className="status-sold font-medium">Connected</span><span className="text-muted-foreground">· {gmFrom}</span>
              </div>
              <div className="border-t border-border pt-4">
                <div className="text-[12px] font-medium text-foreground mb-2">Send a test email</div>
                <div className="space-y-2">
                  <Input value={gmTest.to} onChange={(e) => setGmTest((p) => ({ ...p, to: e.target.value }))} placeholder="To, e.g. you@example.com" className="bg-background font-mono text-[12px]" />
                  <Input value={gmTest.subject} onChange={(e) => setGmTest((p) => ({ ...p, subject: e.target.value }))} placeholder="Subject" className="bg-background text-[13px]" />
                  <Input value={gmTest.body} onChange={(e) => setGmTest((p) => ({ ...p, body: e.target.value }))} placeholder="Message body" className="bg-background text-[13px]" />
                  <Button size="sm" onClick={sendGmailTest} disabled={gmSending} className="gap-1.5"><Send className="w-3.5 h-3.5" /> {gmSending ? 'Sending…' : 'Send test'}</Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-muted-foreground leading-relaxed">
              Gmail isn't connected yet. Connection is a one-time OAuth grant - authorise the Gmail connector, then you'll be able to send test emails from here.
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setGmOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp config (kept for existing credentials) */}
      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="bg-popover border-border max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Connect WhatsApp</DialogTitle>
            <DialogDescription>Enter your WhatsApp Business Cloud API credentials to send messages to any number.</DialogDescription>
          </DialogHeader>
          {waLoading ? (
            <div className="py-6 text-center text-muted-foreground text-[13px]">Loading…</div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-[12px]">Access Token</Label>
                <Input value={waForm.access_token} onChange={(e) => setWaForm((p) => ({ ...p, access_token: e.target.value }))} placeholder="Permanent access token from Meta App" className="mt-1 bg-background font-mono text-[12px]" type="password" />
              </div>
              <div>
                <Label className="text-[12px]">Phone Number ID</Label>
                <Input value={waForm.phone_number_id} onChange={(e) => setWaForm((p) => ({ ...p, phone_number_id: e.target.value }))} placeholder="e.g. 1077XXXXXXXXXXX" className="mt-1 bg-background font-mono text-[12px]" />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={saveWhatsapp} disabled={waSaving} className="gap-1.5"><Save className="w-3.5 h-3.5" /> {waSaving ? 'Saving…' : 'Save credentials'}</Button>
              </div>
              <div className="border-t border-border pt-4">
                <div className="text-[12px] font-medium text-foreground mb-2">Send a test message</div>
                <div className="space-y-2">
                  <Input value={waTest.to} onChange={(e) => setWaTest((p) => ({ ...p, to: e.target.value }))} placeholder="To number, e.g. 27831234567" className="bg-background font-mono text-[12px]" />
                  <Input value={waTest.body} onChange={(e) => setWaTest((p) => ({ ...p, body: e.target.value }))} placeholder="Message body" className="bg-background text-[13px]" />
                  <Button size="sm" variant="outline" onClick={sendTest} disabled={waSending} className="gap-1.5"><Send className="w-3.5 h-3.5" /> {waSending ? 'Sending…' : 'Send test'}</Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="ghost" onClick={() => setWaOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}