// Generic inbound lead webhook.
//
//   POST https://api.legenex.com/functions/webhook?key=<api_key>
//
// Replaces the per-route token model in leadbyteWebhook. One key (master, or a
// supplier-scoped key) authenticates every sender, and the sender does not have
// to be LeadByte: anything that can POST JSON works.
//
// WHAT IT DOES
//   - Authenticates on ?key= against ApiKey. Master keys accept any supplier;
//     a supplier-scoped key pins the lead to that supplier.
//   - Resolves the supplier from the key, falling back to `sid` in the payload.
//   - Reads the status from `lead_status` in the payload (dynamic). A route may
//     pin a status instead, but nothing is required to.
//   - Matches an existing lead on lead id, then email, then mobile.
//   - No match: CREATES the lead. Not every lead reaches this system through
//     processLead; affiliates post straight into their own platform, so this is
//     the first this system hears of them.
//   - Match: UPDATES revenue, buyer, status and any field the stored lead is
//     missing.
//
// RESELL AFTER RETURN
//   A lead can go Sold -> Returned -> Sold with a different buyer. `buyer_returned`
//   is sticky: once true it stays true even when the lead is resold, so the lead
//   counts once as Sold (its current status) and once as Returned (the flag).
//   Resetting the flag on resale would erase the return from every report.
//
// Field names are matched loosely, so a sender may use flat keys (email, sid,
// revenue) or the older prefixed ones (contact_email, supplier_sid, lead_revenue).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  // LeadByte and others send a bare dash for "no value".
  if (s === '' || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'none') return null;
  return s;
};

const num = (v: unknown): number | null => {
  const s = clean(v);
  if (s === null) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const truthy = (v: unknown): boolean => {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
};

// Payload key aliases -> canonical field. First present key wins.
const FIELD_ALIASES: Record<string, string[]> = {
  first_name: ['first_name', 'contact_first_name', 'firstname'],
  last_name: ['last_name', 'contact_last_name', 'lastname'],
  email: ['email', 'contact_email'],
  mobile: ['mobile', 'contact_phone', 'phone', 'phone1'],
  zip: ['zip', 'contact_zip', 'postcode'],
  phone_verified: ['phone_verified', 'contact_phone_verified'],
  trustedform_url: ['trustedform_url', 'contact_trustedform_url'],
  jornaya_token: ['jornaya_token', 'contact_jornaya_token'],
  optin_url: ['optin_url', 'contact_optin_url', 'optinurl'],
  user_agent: ['user_agent', 'contact_user_agent'],
  ip_address: ['ip_address', 'geo_ip', 'ipaddress'],
  geoip_country: ['geoip_country', 'geo_country', 'country'],
  geoip_state: ['geoip_state', 'geo_state'],
  geoip_city: ['geoip_city', 'geo_city'],
  geoip_zip: ['geoip_zip', 'geo_zip'],
  utm_source: ['utm_source'],
  utm_campaign: ['utm_campaign'],
  utm_medium: ['utm_medium'],
  utm_content: ['utm_content'],
  utm_terms: ['utm_terms'],
  ad_label: ['ad_label', 'utm_ad_label'],
  sid: ['sid', 'supplier_sid'],
  ssid: ['ssid', 'supplier_ssid'],
  s1: ['s1', 'supplier_s1', 'c1'],
  s2: ['s2', 'supplier_s2', 'c2'],
  s3: ['s3', 'supplier_s3', 'c3'],
  supplier_brand: ['supplier_brand'],
  'Supplier Source': ['source', 'supplier_source'],
  supplier_payout: ['supplier_payout', 'bid_amount'],
  vertical: ['vertical', 'lead_vertical'],
  lead_tier: ['lead_tier', 'tier'],
  lead_status: ['lead_status', 'status'],
  revenue: ['revenue', 'lead_revenue'],
  buyer_name: ['buyer_name', 'buyername'],
  buyer_id: ['buyer_id', 'buyer'],
  buyer_feedback: ['buyer_feedback'],
  returned: ['buyer_returned', 'returned'],
  returned_reason: ['return_reason', 'buyer_return_reason', 'returned_reason', 'returnreason'],
  accident_state: ['accident_state'],
  accident_type: ['accident_type'],
  accident_details: ['accident_details'],
  incident_date: ['incident_date'],
  injured: ['injured'],
  injury_type: ['injury_type'],
  treatment: ['treatment'],
  treatment_type: ['treatment_type'],
  treatment_time: ['treatment_time'],
  fault: ['fault'],
  attorney: ['attorney'],
  insurance: ['insurance'],
  police_report: ['police_report', 'police_report_filed'],
  tc_id: ['tc_id'],
  leadshook_id: ['leadshook_id'],
  lead_id: ['lead_id', 'leadbyte_id', 'leadid'],
  timestamp: ['timestamp', 'date_created', 'received'],
};

function canonicalise(body: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, keys] of Object.entries(FIELD_ALIASES)) {
    for (const k of keys) {
      const v = clean(body[k]);
      if (v !== null) { out[field] = v; break; }
    }
  }
  return out;
}

// Payload status -> the app's final_status values.
const STATUS_MAP: Record<string, string> = {
  sold: 'Sold',
  unsold: 'Unsold',
  returned: 'Returned',
  return: 'Returned',
  rejected: 'Rejected',
  reject: 'Rejected',
  duplicate: 'Duplicate',
  dupe: 'Duplicate',
  disqualified: 'Disqualified',
  dq: 'Disqualified',
  converted: 'Converted',
  conversion: 'Converted',
  fake: 'Fake',
  qualified: 'Qualified',
  queued: 'Queued',
  error: 'Error',
};

const mapStatus = (v: unknown): string | null => {
  const s = clean(v);
  return s ? (STATUS_MAP[s.toLowerCase()] || null) : null;
};

// Fields an outcome post is allowed to CHANGE inside mapped_fields. Anything
// outside this set is only ever filled when blank.
const MUTABLE_OUTCOME_FIELDS = new Set([
  'lead_status',
  'revenue',
  'buyer_name',
  'buyer_id',
  'buyer_feedback',
  'returned',
  'returned_reason',
  'supplier_payout',
]);

const reply = (status: number, payload: Record<string, unknown>) =>
  Response.json(payload, { status });

// A resold lead can name a buyer this system has never seen. Silently writing
// the code onto the lead leaves reports pointing at a buyer that does not exist,
// so the record is created here and flagged for review.
//
// It is created INERT on purpose: status draft, active false, no pricing and no
// state coverage. Those are operator decisions, and an auto-created buyer must
// never become routable or billable on the strength of a webhook payload.
async function ensureBuyer(svc: any, code: string | null, name: string | null) {
  if (!code && !name) return null;
  const n = (v: unknown) => String(v ?? '').trim().toLowerCase();
  try {
    const buyers = await svc.entities.Buyer.list();
    const list = Array.isArray(buyers) ? buyers : [];
    const hit = list.find((b: any) => {
      if (code && n(b.buyer_code) && n(b.buyer_code) === n(code)) return true;
      if (name && n(b.company_name) && n(b.company_name) === n(name)) return true;
      return false;
    });
    if (hit) return { created: false, id: hit.id, name: hit.company_name, code: hit.buyer_code };

    const created = await svc.entities.Buyer.create({
      company_name: name || code,
      buyer_code: code || undefined,
      auto_created: true,
      status: 'draft',
      active: false,
      notes: `Auto-created from an inbound webhook outcome on ${new Date().toISOString()}. No pricing or state coverage set. Review in Operations, Buyers.`,
    });
    return { created: true, id: created?.id || null, name: name || code, code: code || null };
  } catch {
    return null;
  }
}

// Same contract for a sid that matches no supplier.
async function ensureSupplier(svc: any, sid: string | null) {
  if (!sid) return null;
  try {
    const created = await svc.entities.Supplier.create({
      name: sid,
      sid,
      supplier_type: 'External',
      auto_created: true,
      status: 'new',
      active: false,
      notes: `Auto-created from an inbound webhook sid on ${new Date().toISOString()}. No payout terms set. Review in Operations, Suppliers.`,
    });
    return { created: true, id: created?.id || null, name: sid };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return reply(405, { ok: false, outcome: 'rejected', reason: 'method_not_allowed', message: 'POST a JSON body to this endpoint.' });
  }

  let raw = '';
  let body: Record<string, any> = {};
  try {
    raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return reply(400, { ok: false, outcome: 'rejected', reason: 'invalid_json', message: 'Body was not valid JSON.' });
  }

  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole;

  // == Auth on ?key= (header accepted as an alternative) ==
  const url = new URL(req.url);
  const presented = clean(url.searchParams.get('key'))
    || clean(req.headers.get('x-api-key'))
    || clean(body.key);

  if (!presented) {
    return reply(401, { ok: false, outcome: 'rejected', reason: 'missing_key', message: 'No API key supplied. Append ?key=... to the URL.' });
  }

  let apiKey: any = null;
  try {
    const found = await svc.entities.ApiKey.filter({ key: presented });
    apiKey = (Array.isArray(found) ? found : [])[0] || null;
  } catch { /* fall through to the rejection below */ }

  if (!apiKey || apiKey.active === false) {
    return reply(401, {
      ok: false, outcome: 'rejected', reason: 'invalid_key',
      message: apiKey ? 'That API key is disabled.' : 'That API key is not recognised.',
    });
  }

  // == Optional webhook row ==
  // The key authenticates; `route` is optional and only identifies which
  // InboundWebhookRoute row gets the receipt, and whether that row pins a
  // status instead of reading lead_status off the payload.
  const routeId = clean(url.searchParams.get('route'));
  let route: any = null;
  if (routeId) {
    try {
      const found = await svc.entities.InboundWebhookRoute.filter({ id: routeId });
      route = (Array.isArray(found) ? found : [])[0] || null;
    } catch { /* an unknown route must not block a valid key */ }
  }

  if (route && route.enabled === false) {
    return reply(403, {
      ok: false, outcome: 'rejected', reason: 'webhook_disabled',
      message: `The webhook "${route.name}" is disabled. Enable it in Settings, Inbound Webhooks.`,
    });
  }

  const bumpRoute = async (ok: boolean, errText?: string) => {
    if (!route) return;
    try {
      await svc.entities.InboundWebhookRoute.update(route.id, ok
        ? {
            receipt_count: (Number(route.receipt_count) || 0) + 1,
            last_received_at: new Date().toISOString(),
          }
        : {
            error_count: (Number(route.error_count) || 0) + 1,
            last_error: String(errText || '').slice(0, 500),
          });
    } catch { /* telemetry only */ }
  };

  try {
    // A route may translate the sender's own key names before the built-in
    // aliases run, so a buyer, a call platform or a Sheets Apps Script can post
    // its own column names without a code change. field_map is payload key ->
    // our field name. A route without a field_map behaves exactly as before.
    const routeMap: Record<string, any> = (() => {
      try {
        const m = JSON.parse(route?.field_map || '{}');
        return m && typeof m === 'object' ? m : {};
      } catch { return {}; }
    })();
    const shaped: Record<string, any> = { ...body };
    for (const [payloadKey, field] of Object.entries(routeMap)) {
      if (!field || typeof field !== 'string') continue;
      if (body[payloadKey] !== undefined && shaped[field] === undefined) shaped[field] = body[payloadKey];
    }
    // match_key names the payload key holding the match value, for a sender
    // that uses none of the known aliases.
    if (route?.match_field && route?.match_key && body[route.match_key] !== undefined) {
      shaped[route.match_field] = body[route.match_key];
    }

    const c = canonicalise(shaped);

    // A route can be pinned to one supplier source, so a sender that posts no
    // attribution of its own still lands on the right source. The payload
    // always wins: a pin is a default for silence, never an override, because
    // the per-post value is the truth about that specific lead.
    if (!clean(c.sid) && clean(route?.sid)) c.sid = clean(route.sid);
    if (!clean(c.ssid) && clean(route?.ssid)) c.ssid = clean(route.ssid);
    const email = c.email || null;
    const mobile = c.mobile || null;
    const externalId = num(c.lead_id);
    // A route may pin a status. Blank event_type means dynamic, which is the
    // default: read it from lead_status on the payload.
    const status = mapStatus(route?.event_type) || mapStatus(c.lead_status);
    // Records this request brought into existence, echoed back on the response so
    // the sender's log shows it and the operator can go and review them.
    const autoCreated: Array<Record<string, unknown>> = [];

    // == Supplier resolution ==
    // A supplier-scoped key pins the supplier. A master key resolves it from
    // the sid on the payload, matched loosely against the Supplier records
    // because a sid (LEADFLOW, INBNDS-SURVEY) and a name (LeadFlow, Inbounds)
    // differ in case and suffix.
    // A supplier-scoped key or the webhook row can supply a default. The sid on
    // the payload wins when it resolves, because that is the per-lead truth.
    const fallbackSupplier = clean(apiKey.supplier_name) || clean(route?.supplier_name);
    let supplierName: string | null = fallbackSupplier;
    if (c.sid) {
      let resolved: string | null = null;
      try {
        const sups = await svc.entities.Supplier.list();
        const n = (v: unknown) => String(v ?? '').trim().toLowerCase();
        const s = n(c.sid);
        const hit = (Array.isArray(sups) ? sups : []).find((x: any) => {
          const name = n(x.name);
          const sid = n(x.sid);
          if (sid && s && sid === s) return true;
          return name && s && (name === s || s.includes(name) || name.includes(s));
        });
        if (hit?.name) resolved = hit.name;
      } catch { /* fall through to the raw sid below */ }
      // Only fall back to the raw sid when there is nothing better to use.
      supplierName = resolved || fallbackSupplier || c.sid;
      if (!resolved && !fallbackSupplier) {
        const madeSupplier = await ensureSupplier(svc, c.sid);
        if (madeSupplier?.created) autoCreated.push({ type: 'supplier', name: madeSupplier.name, id: madeSupplier.id });
      }
    }

    // Resolve the buyer named on the outcome, creating an inert record for review
    // when it is one this system has not seen.
    let buyerReview: any = null;
    if (c.buyer_id || c.buyer_name) {
      buyerReview = await ensureBuyer(svc, c.buyer_id || null, c.buyer_name || null);
      if (buyerReview?.created) autoCreated.push({ type: 'buyer', name: buyerReview.name, code: buyerReview.code, id: buyerReview.id });
    }

    // Everything that reaches a lead write counts as a receipt on the row.
    await bumpRoute(true);

    // A cost route carries spend for a day, not a lead outcome. It writes an
    // AdSpend row and returns before any lead matching runs.
    const routePurpose = clean(route?.purpose) || 'lead_outcome';
    if (routePurpose === 'cost') {
      const rawDate = clean(shaped.date) || clean(shaped.spend_date) || clean(shaped.day)
        || (route?.date_key ? clean(body[route.date_key]) : null);
      const rawSpend = shaped.spend ?? shaped.cost ?? shaped.amount ?? shaped.total_cost;
      const spendNum = num(rawSpend);
      const isoDate = rawDate && Number.isFinite(Date.parse(rawDate))
        ? new Date(Date.parse(rawDate)).toISOString().slice(0, 10)
        : null;
      if (!isoDate || spendNum === null) {
        await bumpRoute(false, 'cost post missing date or spend');
        return reply(400, {
          ok: false, outcome: 'rejected', reason: 'cost_missing_fields',
          message: 'A cost webhook needs a date and a spend amount on the payload.',
        });
      }
      const costSupplier = clean(apiKey.supplier_name) || clean(route?.supplier_name) || supplierName;
      await svc.entities.AdSpend.create({
        date: isoDate,
        spend: spendNum,
        platform: 'webhook',
        level: 'account',
        cost_source: `webhook:${route?.name || 'inbound'}`,
        supplier_name: costSupplier || undefined,
        supplier_key: costSupplier ? String(costSupplier).trim().toLowerCase() : undefined,
        leads: num(shaped.leads) ?? 0,
        clicks: num(shaped.clicks) ?? 0,
        impressions: num(shaped.impressions) ?? 0,
      });
      // touchKey is declared below, after the match block, so the key counter
      // is bumped inline here rather than reaching forward into it.
      try {
        await svc.entities.ApiKey.update(apiKey.id, {
          last_used_at: new Date().toISOString(),
          request_count: (Number(apiKey.request_count) || 0) + 1,
        });
      } catch { /* telemetry only */ }
      return reply(200, {
        ok: true, outcome: 'cost_recorded', date: isoDate, spend: spendNum,
        supplier: costSupplier || null,
        message: `Recorded ${spendNum} of spend on ${isoDate}.`,
      });
    }

    if (!email && !mobile && externalId === null) {
      return reply(400, {
        ok: false, outcome: 'rejected', reason: 'no_identifying_fields',
        message: 'Payload carried no email, mobile or lead id, so the lead can neither be matched nor created.',
      });
    }

    // == Match ==
    let existing: any = null;
    const firstOf = (r: unknown) => (Array.isArray(r) ? r : [])[0] || null;
    // A route may pin which field identifies the lead. With none pinned the
    // order stays lead id, then email, then mobile, which is what every
    // existing route relies on.
    const pinned = clean(route?.match_field);
    if (pinned === 'email' && email) {
      existing = firstOf(await svc.entities.Lead.filter({ email }));
    } else if (pinned === 'mobile' && mobile) {
      existing = firstOf(await svc.entities.Lead.filter({ mobile }));
    } else if (pinned === 'lead_id' && externalId !== null) {
      existing = firstOf(await svc.entities.Lead.filter({ leadbyte_lead_id: externalId }));
    }
    if (!existing && externalId !== null) {
      existing = firstOf(await svc.entities.Lead.filter({ leadbyte_lead_id: externalId }));
    }
    if (!existing && email) {
      existing = firstOf(await svc.entities.Lead.filter({ email }));
    }
    if (!existing && mobile) {
      existing = firstOf(await svc.entities.Lead.filter({ mobile }));
    }

    // Record the request against the key regardless of outcome.
    const touchKey = async () => {
      try {
        await svc.entities.ApiKey.update(apiKey.id, {
          last_used_at: new Date().toISOString(),
          request_count: (Number(apiKey.request_count) || 0) + 1,
        });
      } catch { /* telemetry only */ }
    };

    // == Update ==
    if (existing) {
      const prior = (() => {
        try { return JSON.parse(existing.mapped_fields || '{}') || {}; } catch { return {}; }
      })();

      const patch: Record<string, any> = {};
      const changed: string[] = [];

      const revenue = num(c.revenue);
      if (revenue !== null && revenue !== Number(existing.revenue)) { patch.revenue = revenue; changed.push('revenue'); }

      const payout = num(c.supplier_payout);
      if (payout !== null && payout !== Number(existing.supplier_payout)) { patch.supplier_payout = payout; changed.push('supplier_payout'); }

      if (c.buyer_name && c.buyer_name !== existing.buyer_name) { patch.buyer_name = c.buyer_name; changed.push('buyer_name'); }
      if (c.buyer_id && c.buyer_id !== existing.buyer_id) { patch.buyer_id = c.buyer_id; changed.push('buyer_id'); }
      if (c.buyer_feedback && c.buyer_feedback !== existing.buyer_feedback) { patch.buyer_feedback = c.buyer_feedback; changed.push('buyer_feedback'); }

      if (status && status !== existing.final_status) { patch.final_status = status; changed.push('final_status'); }

      // Sticky return flag. A lead resold after a return must still count as a
      // return, so this only ever goes false -> true, never back.
      const nowReturned = status === 'Returned' || truthy(c.returned);
      if (nowReturned && existing.buyer_returned !== true) { patch.buyer_returned = true; changed.push('buyer_returned'); }
      if (c.returned_reason && c.returned_reason !== existing.buyer_return_reason) {
        patch.buyer_return_reason = c.returned_reason;
        changed.push('returned_reason');
      }

      if (externalId !== null && existing.leadbyte_lead_id !== externalId) patch.leadbyte_lead_id = externalId;
      if (supplierName && !clean(existing.supplier_name)) patch.supplier_name = supplierName;

      // Merge the payload into mapped_fields. Outcome fields are MUTABLE: a lead
      // resold to a new buyer carries a new buyer, revenue and status, and the bag
      // must not keep the previous buyer or the dashboard reads a stale value while
      // the column reads the new one. Everything else stays fill-only, because the
      // stored lead is the fuller record for anything the outcome does not carry.
      const merged = { ...prior };
      let mergedChanged = false;
      for (const [k, v] of Object.entries(c)) {
        const incoming = clean(v);
        if (incoming === null) continue;
        if (MUTABLE_OUTCOME_FIELDS.has(k)) {
          if (clean(merged[k]) !== incoming) { merged[k] = incoming; mergedChanged = true; }
        } else if (clean(merged[k]) === null) {
          merged[k] = incoming; mergedChanged = true;
        }
      }
      // Keep the bag's status aligned with the column so the two never disagree.
      if (status && clean(merged.lead_status) !== status) { merged.lead_status = status; mergedChanged = true; }
      merged.last_outcome_at = new Date().toISOString();
      if (status) merged.last_outcome_status = status;
      if (mergedChanged || status) patch.mapped_fields = JSON.stringify(merged);

      if (changed.length === 0) {
        await touchKey();
        return reply(200, {
          ok: true, outcome: 'duplicate', lead_id: existing.id,
          final_status: existing.final_status || null, supplier: existing.supplier_name || supplierName,
          auto_created: autoCreated,
          message: 'Lead already recorded with these values. Nothing changed.',
        });
      }

      await svc.entities.Lead.update(existing.id, { ...patch, leadbyte_outcome_at: new Date().toISOString() });

      // A feedback or call route also leaves a BuyerFeedback record, so the
      // buyer's verdict is auditable per receipt rather than only as the
      // latest value on the lead.
      if (routePurpose === 'buyer_feedback' || routePurpose === 'inbound_call') {
        const verdict = c.buyer_feedback || c.lead_status || status || '';
        if (verdict) {
          await svc.entities.BuyerFeedback.create({
            lead_id: existing.id,
            buyer_id: c.buyer_id || existing.buyer_id || '',
            matched_by: pinned || (externalId !== null ? 'lead_id' : email ? 'email' : 'mobile'),
            disposition: String(verdict).slice(0, 120),
            raw_disposition: String(verdict),
            outcome: status === 'Converted' ? 'converted' : status === 'Returned' ? 'returned' : 'contacted',
            revenue_value: num(c.revenue) ?? undefined,
            notes: c.returned_reason || undefined,
            source: `webhook:${route?.name || 'inbound'}`,
            match_confidence: 'high',
          }).catch(() => { /* the lead write is the contract, this is the audit trail */ });
        }
      }

      await touchKey();
      return reply(200, {
        ok: true, outcome: 'updated', lead_id: existing.id,
        final_status: patch.final_status || existing.final_status || null,
        supplier: patch.supplier_name || existing.supplier_name || supplierName,
        changed,
        auto_created: autoCreated,
        message: `Matched an existing lead and updated ${changed.join(', ')}.`,
      });
    }

    // == Create ==
    // lead_type is sid-derived and lives inside mapped_fields, not as a column.
    const sidUpper = String(c.sid || '').trim().toUpperCase();
    const leadType = (sidUpper === 'LEADFLOW' || sidUpper === 'LGNX') ? 'Quiz' : 'Affiliate';

    const created = await svc.entities.Lead.create({
      archived: false,
      first_name: c.first_name || undefined,
      last_name: c.last_name || undefined,
      email: email || undefined,
      mobile: mobile || undefined,
      supplier_name: supplierName || undefined,
      revenue: num(c.revenue) ?? undefined,
      supplier_payout: num(c.supplier_payout) ?? undefined,
      buyer_name: c.buyer_name || undefined,
      buyer_id: c.buyer_id || undefined,
      buyer_feedback: c.buyer_feedback || undefined,
      buyer_returned: status === 'Returned' || truthy(c.returned),
      buyer_return_reason: c.returned_reason || undefined,
      final_status: status || undefined,
      leadbyte_lead_id: externalId ?? undefined,
      leadbyte_outcome_at: new Date().toISOString(),
      mapped_fields: JSON.stringify({
        ...c,
        lead_type: leadType,
        ingest_channel: 'webhook',
        ingest_key: apiKey.name || apiKey.key_prefix || null,
        last_outcome_at: new Date().toISOString(),
        last_outcome_status: status || null,
      }),
    });

    await touchKey();
    return reply(200, {
      ok: true, outcome: 'created', lead_id: created?.id || null,
      final_status: status || null, supplier: supplierName,
      auto_created: autoCreated,
      message: 'Lead was not in this system and has been created from the payload.',
    });
  } catch (error) {
    const message = (error as Error).message;
    await bumpRoute(false, message);
    return reply(500, { ok: false, outcome: 'error', message });
  }
});
