import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Verifies Xero credentials and pulls invoices/payments as reference data.
// Config stored in IntegrationConfig(name='xero') as { access_token, tenant_id }.
// Xero uses OAuth2 access tokens (paste a token from the Xero developer app /
// custom connection). Verify hits /connections to resolve the tenant, then reads
// invoices. Runs on demand and on schedule.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let isScheduled = false;
    try {
      const user = await base44.auth.me();
      if (!user) isScheduled = true;
      else if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch {
      isScheduled = true;
    }

    const svc = base44.asServiceRole;

    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    let token = body.access_token;
    let tenantId = body.tenant_id;
    let cfg = null;
    if (!token) {
      const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'xero' });
      cfg = cfgList[0];
      if (!cfg) return Response.json({ success: false, error: 'Xero not connected' }, { status: 400 });
      let parsed = {};
      try { parsed = JSON.parse(cfg.config || '{}'); } catch { parsed = {}; }
      token = parsed.access_token;
      tenantId = tenantId || parsed.tenant_id;
    }
    if (!token) return Response.json({ success: false, error: 'Missing Xero access token' }, { status: 400 });

    const authHeaders = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

    // Resolve tenant if not supplied.
    let tenantName = '';
    if (!tenantId) {
      const connRes = await fetch('https://api.xero.com/connections', { headers: authHeaders });
      if (!connRes.ok) {
        const t = await connRes.text();
        return Response.json({ success: false, error: `Xero auth error ${connRes.status}: ${t.slice(0, 200)}` }, { status: 400 });
      }
      const conns = await connRes.json();
      if (!Array.isArray(conns) || conns.length === 0) {
        return Response.json({ success: false, error: 'No Xero organisations found for this token' }, { status: 400 });
      }
      tenantId = conns[0].tenantId;
      tenantName = conns[0].tenantName || '';
    }

    if (body.verify_only) {
      return Response.json({ success: true, tenant: { id: tenantId, name: tenantName } });
    }

    // Pull ACCPAY/ACCREC invoices as reference (light sync).
    const invHeaders = { ...authHeaders, 'Xero-tenant-id': tenantId };
    const invRes = await fetch('https://api.xero.com/api.xro/2.0/Invoices?page=1', { headers: invHeaders });
    let invoiceCount = 0;
    if (invRes.ok) {
      const invJson = await invRes.json();
      invoiceCount = (invJson.Invoices || []).length;
    }

    if (cfg?.id) {
      let parsed = {};
      try { parsed = JSON.parse(cfg.config || '{}'); } catch { parsed = {}; }
      await svc.entities.IntegrationConfig.update(cfg.id, { config: JSON.stringify({ ...parsed, tenant_id: tenantId, last_synced_at: new Date().toISOString() }) });
    }

    return Response.json({ success: true, invoices: invoiceCount, tenant: tenantId, scheduled: isScheduled });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});