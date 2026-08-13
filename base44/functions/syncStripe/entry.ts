import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Verifies a Stripe secret key and pulls recent balance transactions / charges as
// BankTransaction records (source='stripe'). Key stored in IntegrationConfig(name='stripe')
// as { secret_key }. Dedupes on external_id. Runs on demand and on schedule.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow scheduled (no user) and admin-triggered runs.
    let isScheduled = false;
    try {
      const user = await base44.auth.me();
      if (!user) isScheduled = true;
      else if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch {
      isScheduled = true;
    }

    const svc = base44.asServiceRole;

    // Allow an ad-hoc key in the body for the "verify on connect" step.
    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    let token = body.secret_key;
    let cfg = null;
    if (!token) {
      const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'stripe' });
      cfg = cfgList[0];
      if (!cfg) return Response.json({ success: false, error: 'Stripe not connected' }, { status: 400 });
      let parsed = {};
      try { parsed = JSON.parse(cfg.config || '{}'); } catch { parsed = {}; }
      token = parsed.secret_key;
    }
    if (!token) return Response.json({ success: false, error: 'Missing Stripe secret key' }, { status: 400 });

    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

    // Verify the key against the Balance endpoint, which the recommended
    // restricted scopes (Balance + Charges read) actually cover. A restricted
    // key with no account scope 403s on /v1/account, so we don't require it.
    const balRes = await fetch('https://api.stripe.com/v1/balance', { headers });
    if (!balRes.ok) {
      const t = await balRes.text();
      return Response.json({ success: false, error: `Stripe auth error ${balRes.status}: ${t.slice(0, 200)}` }, { status: 400 });
    }

    // Best-effort account fetch for display / stored account_id. Not required:
    // restricted keys may not have account read scope.
    let acct = {};
    try {
      const acctRes = await fetch('https://api.stripe.com/v1/account', { headers });
      if (acctRes.ok) acct = await acctRes.json();
    } catch { /* account scope optional */ }

    // If this was just a verify (body key, no stored config), return account info.
    if (body.verify_only) {
      return Response.json({ success: true, account: { id: acct.id || null, business: acct.business_profile?.name || acct.settings?.dashboard?.display_name || '', country: acct.country || null } });
    }

    // Pull recent balance transactions and ingest as BankTransaction records.
    const existing = await svc.entities.BankTransaction.filter({ source: 'stripe' }).catch(() => []);
    const seen = new Set(existing.map((t) => t.external_id).filter(Boolean));

    const txRes = await fetch('https://api.stripe.com/v1/balance_transactions?limit=100', { headers });
    const toCreate = [];
    if (txRes.ok) {
      const txJson = await txRes.json();
      for (const t of (txJson.data || [])) {
        if (!t.id || seen.has(t.id)) continue;
        seen.add(t.id);
        toCreate.push({
          source: 'stripe',
          external_id: String(t.id),
          date: new Date((t.created || 0) * 1000).toISOString().slice(0, 10),
          description: t.description || t.type || 'Stripe transaction',
          amount: (Number(t.net) || 0) / 100,
          category: (Number(t.net) || 0) >= 0 ? 'revenue' : '',
        });
      }
    }

    if (toCreate.length) await svc.entities.BankTransaction.bulkCreate(toCreate);
    if (cfg?.id) {
      let parsed = {};
      try { parsed = JSON.parse(cfg.config || '{}'); } catch { parsed = {}; }
      await svc.entities.IntegrationConfig.update(cfg.id, { config: JSON.stringify({ ...parsed, account_id: acct.id || parsed.account_id || null, last_synced_at: new Date().toISOString() }) });
    }

    return Response.json({ success: true, ingested: toCreate.length, account: acct.id || null, scheduled: isScheduled });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});