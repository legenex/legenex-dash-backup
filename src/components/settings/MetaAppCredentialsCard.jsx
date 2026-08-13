import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { metaConnectionStatus } from '@/functions/metaConnectionStatus';
import { saveMetaAppCredentials } from '@/functions/saveMetaAppCredentials';
import { appParams } from '@/lib/app-params';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Facebook, CheckCircle2, Copy, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

// Admin-facing home for the Meta (Facebook) app credentials that power the
// Meta Ads connector OAuth login. Lives under Settings > Data Sources so the
// secret is not exposed on the connector card. The secret is stored server-side
// in IntegrationConfig(meta_app); only the last 4 is ever read back.
const FALLBACK_REDIRECT_URI = 'https://api.legenex.com/functions/metaOauthCallback';

function RedirectRow({ uri }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(uri); toast.success('Redirect URI copied'); }
    catch { toast.error('Copy failed'); }
  };
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] font-mono text-foreground">{uri}</code>
      <Button variant="outline" size="sm" onClick={copy} className="shrink-0"><Copy className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

export default function MetaAppCredentialsCard() {
  const qc = useQueryClient();
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['meta-app-credentials'],
    queryFn: async () => (await metaConnectionStatus({})).data,
  });
  const meta = data?.meta_app || { configured: false, app_id: '', secret_last4: '' };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const hostedRedirectUri = `${origin}/api/apps/${appParams.appId}/functions/metaOauthCallback`;

  const save = async () => {
    if (!appId.trim() && !meta.configured) { toast.error('App ID is required'); return; }
    setSaving(true);
    try {
      const res = (await saveMetaAppCredentials({ app_id: appId.trim(), app_secret: appSecret.trim() })).data || {};
      if (res.success) {
        toast.success('Meta app credentials saved');
        setAppId('');
        setAppSecret('');
        qc.invalidateQueries({ queryKey: ['meta-app-credentials'] });
        qc.invalidateQueries({ queryKey: ['meta-connection-status'] });
      } else {
        toast.error(res.error || 'Could not save credentials');
      }
    } catch (e) {
      toast.error(e?.message || 'Could not save credentials');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Facebook className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-semibold text-foreground">Meta App Credentials</h3>
            {isLoading ? null : meta.configured ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-primary">
                <CheckCircle2 className="w-3 h-3" /> Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                Not configured
              </span>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            The Facebook app used for the Meta Ads connector login. Stored server-side; only the last 4 of the secret is ever shown.
          </p>

          {meta.configured && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
              <div className="text-muted-foreground">App ID <span className="font-mono text-foreground">{meta.app_id || '\u2014'}</span></div>
              <div className="text-muted-foreground">App Secret <span className="font-mono text-foreground">{'\u2022\u2022\u2022\u2022' + (meta.secret_last4 || '\u2022\u2022\u2022\u2022')}</span></div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] text-muted-foreground">App ID</Label>
              <Input
                value={appId}
                onChange={e => setAppId(e.target.value)}
                placeholder={meta.app_id || 'e.g. 1661324871102463'}
                className="mt-1 bg-background font-mono text-[12px]"
              />
            </div>
            <div>
              <Label className="text-[12px] text-muted-foreground">App Secret</Label>
              <Input
                type="password"
                value={appSecret}
                onChange={e => setAppSecret(e.target.value)}
                placeholder={meta.configured ? 'Leave blank to keep current' : 'App secret'}
                className="mt-1 bg-background font-mono text-[12px]"
              />
            </div>
          </div>

          <div className="mt-4 rounded-md border border-border bg-background p-3">
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
              <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" /> Valid OAuth Redirect URIs
            </div>
            <p className="text-[12px] text-muted-foreground mt-1">
              Add both of these in your Meta app under Facebook Login, then Settings, then Valid OAuth Redirect URIs. The connector uses the first; the second is a fallback.
            </p>
            <div className="mt-2 space-y-2">
              <RedirectRow uri={hostedRedirectUri} />
              <RedirectRow uri={FALLBACK_REDIRECT_URI} />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:opacity-90">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              {meta.configured ? 'Update credentials' : 'Save credentials'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
