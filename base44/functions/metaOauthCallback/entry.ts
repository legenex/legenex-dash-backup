import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Fallback callback URL (Legenex production custom domain), used only if a
// state entry somehow lacks a stored redirect_uri.
const DEFAULT_REDIRECT_URI = 'https://api.legenex.com/functions/metaOauthCallback';

// Loads the Meta app credentials from IntegrationConfig(name='meta_app') first
// (set via the in-app credentials field), falling back to environment vars.
async function loadMetaAppCreds(svc: any): Promise<{ appId: string; appSecret: string }> {
  let appId = '';
  let appSecret = '';
  try {
    const list = await svc.entities.IntegrationConfig.filter({ name: 'meta_app' });
    const cfg = JSON.parse(list[0]?.config || '{}');
    appId = String(cfg.app_id || '').trim();
    appSecret = String(cfg.app_secret || '').trim();
  } catch { /* ignore */ }
  if (!appId) appId = Deno.env.get('META_APP_ID') || '';
  if (!appSecret) appSecret = Deno.env.get('META_APP_SECRET') || '';
  return { appId, appSecret };
}

// Build a self-closing popup page that posts the result to the opener (the
// wizard) and then closes. targetOrigin is the app origin captured at connect
// time; '*' is a last resort only when it is unknown.
function popupResponse(payload: { success: boolean; connection_id?: string; error?: string }, appOrigin: string) {
  const msg = JSON.stringify({ type: 'meta_oauth', ...payload });
  const target = appOrigin && appOrigin.startsWith('https://') ? appOrigin : '*';
  const heading = payload.success ? 'Connected. You can close this window.' : 'Connection failed. You can close this window.';
  const fallbackRedirect = appOrigin ? `${appOrigin}/settings?tab=integrations` : '';
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Meta connection</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#0b0f17;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;font-size:14px">${heading}</div>
<script>
(function () {
  var msg = ${msg};
  var target = ${JSON.stringify(target)};
  var fallback = ${JSON.stringify(fallbackRedirect)};
  try { if (window.opener && !window.opener.closed) { window.opener.postMessage(msg, target); } } catch (e) {}
  setTimeout(function () {
    if (window.opener && !window.opener.closed) { try { window.close(); } catch (e) {} }
    else if (fallback) { window.location.href = fallback + (msg.success ? '&meta_connected=1' : '&meta_error=' + encodeURIComponent(msg.error || 'failed')); }
  }, 400);
})();
</script>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// Reached by Meta's browser redirect after Facebook Login. A browser redirect
// carries no Base44 auth, so this endpoint does NOT authenticate the caller; it
// authorizes purely on the single-use CSRF state that metaOauthStart issued to
// an authenticated operator, and performs all writes with the service role. It
// verifies and consumes the state, reuses the exact redirect_uri stored with
// it, exchanges the code for a long-lived token, upserts a MetaConnection, and
// posts the result back to the wizard on the stored app origin.
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole;
  let appOrigin = '';
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state') || '';
    if (!code) return popupResponse({ success: false, error: 'missing_code' }, appOrigin);

    // Find and consume the matching CSRF state.
    const stateList = await svc.entities.IntegrationConfig.filter({ name: 'meta_oauth_state' });
    const stateRecord = stateList[0] || null;
    let states: { state: string; created_at: number; origin?: string; redirect_uri?: string }[] = [];
    try { states = JSON.parse(stateRecord?.config || '{}').states || []; } catch { states = []; }
    const entry = states.find(s => s && s.state === state);
    if (!state || !entry) return popupResponse({ success: false, error: 'state_mismatch' }, appOrigin);
    appOrigin = (typeof entry.origin === 'string' && entry.origin.startsWith('https://')) ? entry.origin : '';
    const redirectUri = entry.redirect_uri && entry.redirect_uri.startsWith('https://') ? entry.redirect_uri : DEFAULT_REDIRECT_URI;
    if (stateRecord) {
      await svc.entities.IntegrationConfig.update(stateRecord.id, {
        config: JSON.stringify({ states: states.filter(s => s.state !== state) }),
      }).catch(() => {});
    }

    const { appId, appSecret } = await loadMetaAppCreds(svc);
    if (!appId || !appSecret) return popupResponse({ success: false, error: 'not_configured' }, appOrigin);

    const ver = 'v21.0';

    // 1. Exchange the authorization code for a short-lived access token.
    const shortParams = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code });
    const shortRes = await fetch(`https://graph.facebook.com/${ver}/oauth/access_token?${shortParams.toString()}`);
    const shortJson = await shortRes.json();
    if (shortJson.error || !shortJson.access_token) return popupResponse({ success: false, error: 'token_exchange_failed' }, appOrigin);

    // 2. Exchange the short-lived token for a long-lived one (~60 days).
    const longParams = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortJson.access_token });
    const longRes = await fetch(`https://graph.facebook.com/${ver}/oauth/access_token?${longParams.toString()}`);
    const longJson = await longRes.json();
    if (longJson.error || !longJson.access_token) return popupResponse({ success: false, error: 'long_token_failed' }, appOrigin);

    const accessToken = longJson.access_token;
    const expiresIn = Number(longJson.expires_in) || 0;
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // 3. Read the connected account.
    const meRes = await fetch(`https://graph.facebook.com/${ver}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`);
    const meJson = await meRes.json();
    if (meJson.error) return popupResponse({ success: false, error: 'account_read_failed' }, appOrigin);

    // 4. Upsert the MetaConnection for this Meta account.
    const now = new Date().toISOString();
    const existingConns = await svc.entities.MetaConnection.filter({ platform: 'meta', auth_type: 'oauth', connected_account_id: meJson.id });
    const fields = {
      platform: 'meta',
      auth_type: 'oauth',
      token: accessToken,
      token_expires_at: tokenExpiresAt,
      connected_account_id: meJson.id,
      connected_account_name: meJson.name || meJson.id,
      status: 'active',
      last_validated_at: now,
      last_error: '',
    };
    let connectionId = '';
    if (existingConns[0]) {
      await svc.entities.MetaConnection.update(existingConns[0].id, fields);
      connectionId = existingConns[0].id;
    } else {
      const created = await svc.entities.MetaConnection.create({
        ...fields,
        name: meJson.name ? `${meJson.name} (Facebook Login)` : 'Facebook Login',
      });
      connectionId = created.id;
    }

    return popupResponse({ success: true, connection_id: connectionId }, appOrigin);
  } catch (error) {
    return popupResponse({ success: false, error: (error as Error).message }, appOrigin);
  }
});
