import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Operator-only buyer onboarding orchestrator (/functions/onboardBuyer).
//
// Drives a BuyerOnboarding record through the full ordered list of steps:
// validate, create_buyer, allocate_code, xero_contact, stripe_customer,
// deposit_invoice, xero_invoice, payment_link, leadbyte_buyer, dispo_scope,
// onboarding_email, crm_contact, schedule_intro_email.
//
// Each step is idempotent: a step holding an external_id (or already marked
// complete or skipped) is never re run, so a retry never calls a remote system
// twice. On a failure the step records the error, status becomes blocked and
// current_step is set to the failed step, and the run stops.
//
// Provider credentials are read from the same storage the existing sync
// functions use (IntegrationConfig for Xero and Stripe, the default LeadByte
// connector header for the LeadByte key). Secrets are never written into the
// steps array, an error message, or a log line.
//
// The buyer is always created in draft and is never made active here.

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];

// The full ordered list of step keys. This shape is fixed now so later builds
// can drop in the external steps without reshaping the record.
const STEP_ORDER = [
  'validate',
  'create_buyer',
  'allocate_code',
  'xero_contact',
  'stripe_customer',
  'deposit_invoice',
  'xero_invoice',
  'payment_link',
  'leadbyte_buyer',
  'dispo_scope',
  'onboarding_email',
  'crm_contact',
  'schedule_intro_email',
];

// Every step is implemented now.
const IMPLEMENTED_STEPS = new Set(STEP_ORDER);

const APP_TIMEZONE = 'America/Regina';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim());
}

// Build a fresh steps array with every key present. Merge in any existing
// records by key so completed steps and their metadata survive a resume.
function buildSteps(existing: any[]): any[] {
  const byKey: Record<string, any> = {};
  for (const s of (Array.isArray(existing) ? existing : [])) {
    if (s && s.key) byKey[s.key] = s;
  }
  return STEP_ORDER.map((key) => {
    const prior = byKey[key];
    return {
      key,
      status: prior?.status || 'pending',
      attempts: Number(prior?.attempts) || 0,
      error: prior?.error ?? null,
      external_id: prior?.external_id ?? null,
      completed_at: prior?.completed_at ?? null,
    };
  });
}

function getStep(steps: any[], key: string): any {
  return steps.find((s) => s.key === key);
}

// Resolve the current wall-clock time in the app timezone as separate parts, so
// scheduling logic can reason about local hour and weekday without pulling in a
// date library.
function localParts(now: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[map.weekday] ?? 0,
    hour: Number(map.hour === '24' ? '0' : map.hour) || 0,
    minute: Number(map.minute) || 0,
  };
}

// Return the UTC offset (in minutes) for the app timezone at a given instant.
// Used to convert a desired local wall-clock time into a UTC ISO string.
function tzOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === '24' ? '0' : map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return (asUTC - at.getTime()) / 60000;
}

// Build a UTC ISO string for a local wall-clock time on a specific local date.
// daysAhead is measured against the current local date.
function localWallClockToUtcIso(baseNow: Date, daysAhead: number, localHour: number, localMinute: number): string {
  // Establish the current local Y/M/D.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = dtf.formatToParts(baseNow);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const y = Number(map.year);
  const m = Number(map.month);
  const d = Number(map.day) + daysAhead;
  // Treat the desired local time as if it were UTC, then correct by the
  // timezone offset at that instant.
  const naiveUtc = Date.UTC(y, m - 1, d, localHour, localMinute, 0);
  const offset = tzOffsetMinutes(new Date(naiveUtc));
  return new Date(naiveUtc - offset * 60000).toISOString();
}

// Resolve the intro email send time per the exact rules:
// - if local time is after 8am and before 3pm, schedule one hour from now;
// - otherwise if today is before Friday, schedule 10am the next local day;
// - otherwise schedule 10am on the coming Monday.
function resolveIntroEmailTime(now: Date): string {
  const { weekday, hour } = localParts(now);
  if (hour >= 8 && hour < 15) {
    return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }
  // weekday: 0 Sun .. 5 Fri .. 6 Sat. "Before Friday" means Mon-Thu (1..4)
  // and also Sunday (0), which is before the coming Friday.
  if (weekday >= 1 && weekday <= 4) {
    return localWallClockToUtcIso(now, 1, 10, 0);
  }
  // Friday (5), Saturday (6) or Sunday (0): schedule 10am the coming Monday.
  let daysUntilMonday: number;
  if (weekday === 5) daysUntilMonday = 3;      // Fri -> Mon
  else if (weekday === 6) daysUntilMonday = 2; // Sat -> Mon
  else daysUntilMonday = 1;                     // Sun -> Mon
  return localWallClockToUtcIso(now, daysUntilMonday, 10, 0);
}

// Promote the operational fields from the raw form payload onto a Buyer create.
// Only defined values are copied so we never clobber schema defaults with null.
function buildBuyerFromPayload(payload: any, companyName: string): Record<string, any> {
  const out: Record<string, any> = {
    company_name: companyName,
    status: 'draft',
  };
  const copyString = (dest: string, src: string) => {
    const v = str(payload[src]);
    if (v) out[dest] = v;
  };
  const copyNumber = (dest: string, src: string) => {
    if (payload[src] !== undefined && payload[src] !== null && payload[src] !== '') {
      const n = Number(payload[src]);
      if (!Number.isNaN(n)) out[dest] = n;
    }
  };

  copyString('client_type', 'client_type');
  copyString('vertical', 'vertical');
  copyString('billing_type', 'billing_type');
  copyNumber('ipl_fee_pct', 'ipl_fee_pct');

  // CPL related fields land on the buyer as plain fields. No BuyerStateCpl rows
  // are created here.
  copyNumber('credit_limit', 'credit_limit');
  copyString('billing_model', 'billing_model');
  copyString('billing_email', 'billing_email');

  copyString('delivery_method', 'delivery_method');
  copyString('api_docs_url', 'api_docs_url');
  copyString('api_docs_file_url', 'api_docs_file_url');
  copyString('buyer_api_key', 'buyer_api_key');
  copyString('unique_identifier', 'unique_identifier');
  copyString('qualification_criteria', 'qualification_criteria');

  // JSON-array style fields: store the raw string if a value is present.
  const copyJson = (dest: string, src: string) => {
    if (payload[src] !== undefined && payload[src] !== null && payload[src] !== '') {
      out[dest] = typeof payload[src] === 'string' ? payload[src] : JSON.stringify(payload[src]);
    }
  };
  copyJson('lead_notification_emails', 'lead_notification_emails');
  copyJson('disposition_method', 'disposition_method');

  // TCPA fields.
  copyString('tcpa_inbound_phone', 'tcpa_inbound_phone');
  copyJson('tcpa_outbound_phones', 'tcpa_outbound_phones');
  copyString('tcpa_inbound_email', 'tcpa_inbound_email');
  copyString('tcpa_outbound_email', 'tcpa_outbound_email');
  copyString('tcpa_reply_to_email', 'tcpa_reply_to_email');

  // Secondary contact.
  copyString('secondary_contact_name', 'secondary_contact_name');
  copyString('secondary_contact_email', 'secondary_contact_email');
  copyString('secondary_contact_phone', 'secondary_contact_phone');
  copyString('secondary_contact_role', 'secondary_contact_role');

  // Billing / accounts.
  copyString('billing_address', 'billing_address');
  copyString('accounts_contact_name', 'accounts_contact_name');
  copyString('accounts_email', 'accounts_email');
  copyNumber('initial_batch_size', 'initial_batch_size');
  copyString('taxpayer_form_url', 'taxpayer_form_url');

  // Primary contact from the intake maps onto the buyer's own contact fields.
  const primaryEmail = str(payload.primary_contact_email);
  if (primaryEmail && !out.email) out.email = primaryEmail;
  const primaryPhone = str(payload.primary_contact_phone);
  if (primaryPhone && !out.phone) out.phone = primaryPhone;

  return out;
}

// ── Provider credential helpers ────────────────────────────────────────────
// All read from the same storage the existing sync functions use. Each returns
// the credentials or throws a generic error that never contains the secret.

async function getXeroCreds(svc: any): Promise<{ token: string; tenantId: string }> {
  const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'xero' });
  const cfg = cfgList[0];
  if (!cfg) throw new Error('Xero is not connected.');
  let parsed: any = {};
  try { parsed = JSON.parse(cfg.config || '{}'); } catch { parsed = {}; }
  const token = parsed.access_token;
  let tenantId = parsed.tenant_id;
  if (!token) throw new Error('Xero access token is missing.');
  if (!tenantId) {
    // Resolve the tenant from /connections, exactly as syncXero does.
    const connRes = await fetch('https://api.xero.com/connections', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!connRes.ok) throw new Error(`Xero auth error ${connRes.status}.`);
    const conns = await connRes.json();
    if (!Array.isArray(conns) || conns.length === 0) throw new Error('No Xero organisations found for this token.');
    tenantId = conns[0].tenantId;
  }
  return { token, tenantId };
}

async function getStripeKey(svc: any): Promise<string> {
  const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'stripe' });
  const cfg = cfgList[0];
  if (!cfg) throw new Error('Stripe is not connected.');
  let parsed: any = {};
  try { parsed = JSON.parse(cfg.config || '{}'); } catch { parsed = {}; }
  const key = parsed.secret_key;
  if (!key) throw new Error('Stripe secret key is missing.');
  return key;
}

// The LeadByte base URL and X_KEY come from the default LeadByte connector, the
// same record the live pipeline forwards leads through. We never hardcode the
// key: we read the connector's own X_KEY header value.
async function getLeadByteConfig(svc: any): Promise<{ baseUrl: string; key: string }> {
  const conns = await svc.entities.LeadByteConnector.filter({ kind: 'leadbyte' });
  const conn = conns.find((c: any) => c.is_default) || conns[0];
  if (!conn || !conn.target_url) throw new Error('LeadByte connector is not configured.');
  let key = '';
  try {
    const rows = typeof conn.headers === 'string' ? JSON.parse(conn.headers || '[]') : (conn.headers || []);
    if (Array.isArray(rows)) {
      const row = rows.find((r: any) => r.key && String(r.key).toLowerCase() === 'x_key');
      key = row ? row.value : '';
    } else if (rows && typeof rows === 'object') {
      key = rows.X_KEY || rows.x_key || '';
    }
  } catch { key = ''; }
  if (!key) throw new Error('LeadByte key is missing from the connector configuration.');
  // Derive the API base (scheme + host + /restapi/vX.Y/) from the leads URL.
  const u = new URL(conn.target_url);
  const base = u.pathname.replace(/\/leads\/?$/, '/');
  return { baseUrl: `${u.origin}${base}`, key };
}

// Rebrandly key: read from IntegrationConfig(name='rebrandly'), the same
// storage the other integrations use. Never hardcoded.
async function getRebrandlyKey(svc: any): Promise<string> {
  const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'rebrandly' });
  const cfg = cfgList[0];
  if (!cfg) throw new Error('Rebrandly is not connected.');
  let parsed: any = {};
  try { parsed = JSON.parse(cfg.config || '{}'); } catch { parsed = {}; }
  if (!parsed.api_key) throw new Error('Rebrandly API key is missing.');
  return parsed.api_key;
}

// Slugify a company name into a Rebrandly slashtag: lowercase, punctuation
// removed, spaces to hyphens, collapsed and trimmed.
function slugifyCompany(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Operator authorization guard, copied from operationsData exactly. ──
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const record = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
    const caller = record || user;

    if (caller.base_role === 'supplier' || caller.base_role === 'buyer') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (caller.linked_buyer_id || caller.linked_supplier_id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let permissions: Record<string, any> = {};
    try {
      permissions = typeof caller.permissions === 'string'
        ? JSON.parse(caller.permissions || '{}')
        : (caller.permissions || {});
    } catch { permissions = {}; }
    const hasOperatorPermission = OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
    if (!hasOperatorPermission && caller.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Arguments ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const onboardingId = str(body.onboarding_id);
    const fromStep = str(body.from_step) || null;
    if (!onboardingId) {
      return Response.json({ error: 'onboarding_id is required.' }, { status: 400 });
    }
    if (fromStep && !STEP_ORDER.includes(fromStep)) {
      return Response.json({ error: `Unknown from_step: ${fromStep}` }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    const onboarding = await svc.entities.BuyerOnboarding.get(onboardingId).catch(() => null);
    if (!onboarding) {
      return Response.json({ error: 'BuyerOnboarding record not found.' }, { status: 404 });
    }

    let payload: any = {};
    try {
      payload = typeof onboarding.form_payload === 'string'
        ? JSON.parse(onboarding.form_payload || '{}')
        : (onboarding.form_payload || {});
    } catch { payload = {}; }

    let existingSteps: any[] = [];
    try {
      existingSteps = typeof onboarding.steps === 'string'
        ? JSON.parse(onboarding.steps || '[]')
        : (onboarding.steps || []);
    } catch { existingSteps = []; }

    const steps = buildSteps(existingSteps);
    let buyerId = onboarding.buyer_id || null;
    let introEmailTime = onboarding.intro_email_scheduled_for || null;

    // Cross-step values produced by deposit_invoice and consumed by the
    // xero_invoice and payment_link steps. On a resume where deposit_invoice is
    // already complete, these are rehydrated from the stored step below.
    let hostedInvoiceUrl: string | null = null;
    let depositInvoiceId: string | null = null;
    {
      const depStep = getStep(steps, 'deposit_invoice');
      if (depStep) {
        if (depStep.external_id) depositInvoiceId = depStep.external_id;
        if (depStep.hosted_invoice_url) hostedInvoiceUrl = depStep.hosted_invoice_url;
      }
    }

    // Persist the current steps array (and optional extra patch) to the record.
    const persist = async (patch: Record<string, any> = {}) => {
      await svc.entities.BuyerOnboarding.update(onboardingId, {
        steps: JSON.stringify(steps),
        ...patch,
      });
    };

    // Mark onboarding in_progress at the start (never regress to submitted).
    await persist({ status: 'in_progress', current_step: null });

    // The index to resume from. from_step overrides; otherwise start at 0 and
    // rely on per-step completion checks to skip finished work.
    const startIndex = fromStep ? STEP_ORDER.indexOf(fromStep) : 0;

    // Mark a step skipped with a reason. Skipped counts as done: it never blocks
    // and it is never re run.
    const markSkipped = (step: any, reason: string) => {
      step.status = 'skipped';
      step.error = reason;
      step.completed_at = new Date().toISOString();
    };

    // Run one step. Returns true to continue, false to stop (blocked).
    const runStep = async (key: string): Promise<boolean> => {
      const step = getStep(steps, key);

      // Idempotent: never re run a step that is already complete, skipped, or
      // already holds an external_id from a prior successful remote call.
      if (step.status === 'complete' || step.status === 'skipped' || step.external_id) {
        return true;
      }

      await persist({ current_step: key });
      step.attempts = (Number(step.attempts) || 0) + 1;

      // A step may mark itself skipped inside the try block. We track that so the
      // shared success tail does not overwrite the skipped status.
      let skipped = false;

      try {
        if (key === 'validate') {
          const status = onboarding.status;
          if (status === 'cancelled' || status === 'complete') {
            throw new Error(`Cannot onboard a ${status} record.`);
          }
          const errs: string[] = [];
          if (!str(payload.company_name)) errs.push('company_name');
          if (!str(payload.primary_contact_name)) errs.push('primary contact name');
          const email = str(payload.primary_contact_email);
          if (!email) errs.push('email');
          else if (!EMAIL_RE.test(email)) errs.push('a valid email');
          if (!str(payload.primary_contact_phone)) errs.push('phone');
          const rawStates = Array.isArray(payload.target_states) ? payload.target_states : [];
          if (rawStates.filter((s: unknown) => str(s)).length === 0) errs.push('at least one target state');
          if (!str(payload.client_type)) errs.push('client_type');
          if (payload.cpl === undefined || payload.cpl === null || payload.cpl === '' || Number.isNaN(Number(payload.cpl))) {
            errs.push('cpl');
          }
          if (!str(payload.billing_type)) errs.push('billing_type');
          if (errs.length > 0) {
            throw new Error(`Submission is missing required fields: ${errs.join(', ')}.`);
          }
        } else if (key === 'create_buyer') {
          if (!buyerId) {
            const companyName = str(payload.company_name) || onboarding.company_name;
            const buyerData = buildBuyerFromPayload(payload, companyName);
            const created = await svc.entities.Buyer.create(buyerData);
            buyerId = created.id;
            step.external_id = created.id;
            await persist({ buyer_id: buyerId });
          } else {
            step.external_id = buyerId;
          }
        } else if (key === 'allocate_code') {
          const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
          if (!buyer) throw new Error('Buyer record not found for code allocation.');
          if (buyer.buyer_code) {
            // Already allocated: never allocate twice.
            step.external_id = buyer.buyer_code;
          } else {
            const result = await base44.asServiceRole.functions.invoke('allocateBuyerCode', {
              client_type: buyer.client_type,
            });
            const data = result?.data !== undefined ? result.data : result;
            const code = data?.buyer_code;
            if (!code) {
              throw new Error(data?.error || 'allocateBuyerCode did not return a code.');
            }
            await svc.entities.Buyer.update(buyerId, { buyer_code: code, leadbyte_bid: code });
            step.external_id = code;
          }
        } else if (key === 'xero_contact') {
          const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
          if (!buyer) throw new Error('Buyer record not found for Xero contact.');
          if (buyer.xero_contact_id) {
            step.external_id = buyer.xero_contact_id;
          } else {
            const { token, tenantId } = await getXeroCreds(svc);
            const contactName = str(payload.company_name) || buyer.company_name || 'Buyer';
            const contactBody: any = {
              Name: contactName,
              AccountNumber: buyer.buyer_code || '',
              EmailAddress: str(payload.primary_contact_email) || buyer.email || '',
            };
            const firstName = str(payload.primary_contact_name).split(' ')[0] || '';
            const lastName = str(payload.primary_contact_name).split(' ').slice(1).join(' ') || '';
            if (firstName) contactBody.FirstName = firstName;
            if (lastName) contactBody.LastName = lastName;
            const phone = str(payload.primary_contact_phone) || buyer.phone || '';
            if (phone) contactBody.Phones = [{ PhoneType: 'DEFAULT', PhoneNumber: phone }];
            const resp = await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Xero-tenant-id': tenantId,
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ Contacts: [contactBody] }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(`Xero contact create failed (HTTP ${resp.status}).`);
            const contactId = data?.Contacts?.[0]?.ContactID;
            if (!contactId) throw new Error('Xero did not return a contact id.');
            await svc.entities.Buyer.update(buyerId, { xero_contact_id: contactId });
            step.external_id = contactId;
          }
        } else if (key === 'stripe_customer') {
          const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
          if (!buyer) throw new Error('Buyer record not found for Stripe customer.');
          if (buyer.stripe_customer_id) {
            step.external_id = buyer.stripe_customer_id;
          } else {
            const key2 = await getStripeKey(svc);
            const form = new URLSearchParams();
            form.set('name', str(payload.company_name) || buyer.company_name || 'Buyer');
            const custEmail = str(payload.primary_contact_email) || buyer.email || '';
            if (custEmail) form.set('email', custEmail);
            const billingAddress = str(payload.billing_address) || buyer.billing_address || '';
            if (billingAddress) form.set('address[line1]', billingAddress);
            // Tax status exempt.
            form.set('tax_exempt', 'exempt');
            const resp = await fetch('https://api.stripe.com/v1/customers', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${key2}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: form.toString(),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(`Stripe customer create failed (HTTP ${resp.status}).`);
            if (!data.id) throw new Error('Stripe did not return a customer id.');
            await svc.entities.Buyer.update(buyerId, { stripe_customer_id: data.id });
            step.external_id = data.id;
          }
        } else if (key === 'deposit_invoice') {
          const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
          if (!buyer) throw new Error('Buyer record not found for deposit invoice.');
          const billingType = str(buyer.billing_type) || str(payload.billing_type);
          if (billingType !== 'prepay') {
            markSkipped(step, `Billing type is ${billingType || 'not set'}, invoiced rather than deposit based.`);
            skipped = true;
          } else {
            const key2 = await getStripeKey(svc);
            const cpl = Number(payload.cpl);
            const qty = Number(payload.initial_batch_size) || Number(buyer.initial_batch_size) || 0;
            const unitAmount = Math.round(cpl * 100);
            const description = `Leads - Batch 1 Deposit, ${qty} leads in total`;
            const customerId = buyer.stripe_customer_id;
            if (!customerId) throw new Error('Stripe customer id is missing for the deposit invoice.');

            // 1. Create the invoice item.
            const itemForm = new URLSearchParams();
            itemForm.set('customer', customerId);
            itemForm.set('currency', 'usd');
            itemForm.set('unit_amount', String(unitAmount));
            itemForm.set('quantity', String(qty));
            itemForm.set('description', description);
            const itemResp = await fetch('https://api.stripe.com/v1/invoiceitems', {
              method: 'POST',
              headers: { Authorization: `Bearer ${key2}`, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: itemForm.toString(),
            });
            const itemData = await itemResp.json().catch(() => ({}));
            if (!itemResp.ok) throw new Error(`Stripe invoice item failed (HTTP ${itemResp.status}).`);

            // 2. Create the invoice (send_invoice, enabled payment methods).
            const invForm = new URLSearchParams();
            invForm.set('customer', customerId);
            invForm.set('collection_method', 'send_invoice');
            invForm.set('days_until_due', '30');
            invForm.set('description', description);
            invForm.set('payment_settings[payment_method_types][]', 'us_bank_account');
            invForm.append('payment_settings[payment_method_types][]', 'customer_balance');
            const invResp = await fetch('https://api.stripe.com/v1/invoices', {
              method: 'POST',
              headers: { Authorization: `Bearer ${key2}`, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: invForm.toString(),
            });
            const invData = await invResp.json().catch(() => ({}));
            if (!invResp.ok) throw new Error(`Stripe invoice create failed (HTTP ${invResp.status}).`);
            const invoiceId = invData.id;
            if (!invoiceId) throw new Error('Stripe did not return an invoice id.');

            // 3. Finalise the invoice so it has a hosted url.
            const finResp = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}/finalize`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${key2}`, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: '',
            });
            const finData = await finResp.json().catch(() => ({}));
            if (!finResp.ok) throw new Error(`Stripe invoice finalize failed (HTTP ${finResp.status}).`);

            depositInvoiceId = invoiceId;
            hostedInvoiceUrl = finData.hosted_invoice_url || invData.hosted_invoice_url || null;
            step.external_id = invoiceId;
            step.hosted_invoice_url = hostedInvoiceUrl;
          }
        } else if (key === 'xero_invoice') {
          const depStep = getStep(steps, 'deposit_invoice');
          if (depStep.status === 'skipped' || !depositInvoiceId) {
            markSkipped(step, 'Deposit invoice did not run, no sales invoice to mirror.');
            skipped = true;
          } else {
            const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
            if (!buyer) throw new Error('Buyer record not found for Xero invoice.');
            const { token, tenantId } = await getXeroCreds(svc);
            const cpl = Number(payload.cpl);
            const qty = Number(payload.initial_batch_size) || Number(buyer.initial_batch_size) || 0;
            const description = `Leads - Batch 1 Deposit, ${qty} leads in total`;
            const invBody: any = {
              Type: 'ACCREC',
              Contact: buyer.xero_contact_id ? { ContactID: buyer.xero_contact_id } : { Name: buyer.company_name },
              LineItems: [{
                Description: description,
                Quantity: qty,
                UnitAmount: cpl,
                AccountCode: '200',
              }],
              Status: 'AUTHORISED',
            };
            const resp = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Xero-tenant-id': tenantId,
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ Invoices: [invBody] }),
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(`Xero invoice create failed (HTTP ${resp.status}).`);
            const xeroInvoiceId = data?.Invoices?.[0]?.InvoiceID;
            if (!xeroInvoiceId) throw new Error('Xero did not return an invoice id.');
            step.external_id = xeroInvoiceId;
          }
        } else if (key === 'payment_link') {
          const depStep = getStep(steps, 'deposit_invoice');
          if (depStep.status === 'skipped' || !depositInvoiceId) {
            markSkipped(step, 'Deposit invoice did not run, no payment link required.');
            skipped = true;
          } else {
            const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
            if (!buyer) throw new Error('Buyer record not found for payment link.');
            if (buyer.payment_link_url) {
              step.external_id = buyer.payment_link_url;
            } else {
              if (!hostedInvoiceUrl) throw new Error('Hosted invoice url is missing for the payment link.');
              const apiKey = await getRebrandlyKey(svc);
              const baseSlug = slugifyCompany(str(payload.company_name) || buyer.company_name || 'buyer') || 'buyer';

              const createLink = async (slashtag: string) => {
                return await fetch('https://api.rebrandly.com/v1/links', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', apikey: apiKey },
                  body: JSON.stringify({ destination: hostedInvoiceUrl, slashtag }),
                });
              };

              let resp = await createLink(baseSlug);
              // On a duplicate slashtag, append a short numeric suffix and retry once.
              if (resp.status === 403 || resp.status === 409 || resp.status === 400) {
                const suffix = String(Math.floor(Math.random() * 90) + 10);
                resp = await createLink(`${baseSlug}-${suffix}`);
              }
              const data = await resp.json().catch(() => ({}));
              if (!resp.ok) throw new Error(`Rebrandly link create failed (HTTP ${resp.status}).`);
              const shortUrl = data.shortUrl ? (data.shortUrl.startsWith('http') ? data.shortUrl : `https://${data.shortUrl}`) : null;
              if (!shortUrl) throw new Error('Rebrandly did not return a short link.');
              await svc.entities.Buyer.update(buyerId, { payment_link_url: shortUrl });
              step.external_id = shortUrl;
            }
          }
        } else if (key === 'leadbyte_buyer') {
          const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
          if (!buyer) throw new Error('Buyer record not found for LeadByte buyer create.');
          const { baseUrl, key: lbKey } = await getLeadByteConfig(svc);
          const firstName = str(payload.primary_contact_name).split(' ')[0] || '';
          const lastName = str(payload.primary_contact_name).split(' ').slice(1).join(' ') || '';
          const form = new URLSearchParams();
          form.set('company', str(payload.company_name) || buyer.company_name || '');
          form.set('firstname', firstName);
          form.set('lastname', lastName);
          form.set('email', str(payload.primary_contact_email) || buyer.email || '');
          form.set('phone', str(payload.primary_contact_phone) || buyer.phone || '');
          form.set('bid', buyer.buyer_code || '');
          form.set('external_ref', buyer.buyer_code || '');
          form.set('autologin', 'Yes');
          form.set('country_name', 'United States');
          const resp = await fetch(`${baseUrl}buyers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', X_KEY: lbKey },
            body: form.toString(),
          });
          const text = await resp.text();
          let data: any;
          try { data = JSON.parse(text); } catch { data = { raw: text }; }
          if (!resp.ok) throw new Error(`LeadByte buyer create failed (HTTP ${resp.status}).`);
          const lbBuyerId = data?.buyer_id || data?.id || data?.records?.[0]?.id || data?.data?.id || '';
          step.external_id = lbBuyerId ? String(lbBuyerId) : (buyer.buyer_code || 'created');
        } else if (key === 'dispo_scope') {
          // Buyer feedback already lives in the BuyerFeedback entity keyed on the
          // buyer, so this step is complete once buyer_id is set. A BigQuery table
          // is only attempted when a BigQuery delivery is actually configured.
          if (!buyerId) throw new Error('Buyer id is not set for disposition scope.');
          let bigQueryConfigured = false;
          try {
            const dests = await svc.entities.LeadByteConnector.filter({ kind: 'bigquery' });
            bigQueryConfigured = Array.isArray(dests) && dests.some((d: any) => d.enabled);
          } catch { bigQueryConfigured = false; }
          if (!bigQueryConfigured) {
            markSkipped(step, 'No BigQuery delivery is configured, disposition scope handled by BuyerFeedback.');
            skipped = true;
          } else {
            step.external_id = `buyerfeedback:${buyerId}`;
          }
        } else if (key === 'onboarding_email') {
          const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
          if (!buyer) throw new Error('Buyer record not found for onboarding email.');
          const to = str(payload.primary_contact_email) || buyer.email || '';
          if (!to) throw new Error('No recipient email for the onboarding email.');
          const contactName = str(payload.primary_contact_name) || 'there';
          const companyName = str(payload.company_name) || buyer.company_name || '';
          const tplList = await svc.entities.OnboardingEmailTemplate.filter({ event: 'complete' });
          const tpl = (Array.isArray(tplList) ? tplList : [])[0] || null;
          if (tpl && tpl.enabled === false) {
            markSkipped(step, 'Complete email is disabled in settings.');
            skipped = true;
          } else {
            const vars: Record<string, string> = {
              company_name: companyName,
              contact_name: contactName,
              buyer_code: buyer.buyer_code || '',
              vertical: str(buyer.vertical) || str(payload.vertical) || '',
            };
            const renderTpl = (s: unknown) => String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k]) : ''));
            const subject = tpl && tpl.subject ? renderTpl(tpl.subject) : 'Welcome to Legenex';
            const body = tpl && tpl.body
              ? renderTpl(tpl.body)
              : `Hi ${contactName},\n\nWelcome aboard. Your account for ${companyName} has been set up and we are getting everything ready for your first leads.\n\nWe will be in touch shortly with next steps.\n\nThank you,\nThe Legenex Team`;
            const result = await base44.asServiceRole.functions.invoke('sendGmail', { to, subject, body });
            const data = result?.data !== undefined ? result.data : result;
            const messageId = data?.message_id || data?.id || data?.messageId || '';
            step.external_id = messageId ? String(messageId) : 'sent';
          }
        } else if (key === 'crm_contact') {
          // Optional GHL / LeadConnector integration. When not configured, skip
          // rather than block: a missing optional integration must not stop
          // onboarding.
          let ghlCfg: any = null;
          try {
            const cfgList = await svc.entities.IntegrationConfig.filter({ name: 'ghl' });
            ghlCfg = cfgList[0] || null;
            if (!ghlCfg) {
              const alt = await svc.entities.IntegrationConfig.filter({ name: 'leadconnector' });
              ghlCfg = alt[0] || null;
            }
          } catch { ghlCfg = null; }
          if (!ghlCfg) {
            markSkipped(step, 'No GHL or LeadConnector integration is configured.');
            skipped = true;
          } else {
            let parsed: any = {};
            try { parsed = JSON.parse(ghlCfg.config || '{}'); } catch { parsed = {}; }
            const apiKey = parsed.api_key || parsed.access_token;
            const locationId = parsed.location_id || '';
            if (!apiKey) {
              markSkipped(step, 'GHL integration is present but has no API key.');
              skipped = true;
            } else {
              const buyer = await svc.entities.Buyer.get(buyerId).catch(() => null);
              const firstName = str(payload.primary_contact_name).split(' ')[0] || '';
              const lastName = str(payload.primary_contact_name).split(' ').slice(1).join(' ') || '';
              const contactBody: any = {
                firstName, lastName,
                email: str(payload.primary_contact_email) || buyer?.email || '',
                phone: str(payload.primary_contact_phone) || buyer?.phone || '',
                companyName: str(payload.company_name) || buyer?.company_name || '',
              };
              if (locationId) contactBody.locationId = locationId;
              const resp = await fetch('https://services.leadconnectorhq.com/contacts/', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                  Version: '2021-07-28',
                },
                body: JSON.stringify(contactBody),
              });
              const data = await resp.json().catch(() => ({}));
              if (!resp.ok) throw new Error(`GHL contact create failed (HTTP ${resp.status}).`);
              const contactId = data?.contact?.id || data?.id || '';
              step.external_id = contactId ? String(contactId) : 'created';
            }
          }
        } else if (key === 'schedule_intro_email') {
          introEmailTime = resolveIntroEmailTime(new Date());
          await persist({ intro_email_scheduled_for: introEmailTime });
          step.external_id = introEmailTime;
        }

        if (!skipped) {
          step.status = 'complete';
          step.error = null;
          step.completed_at = new Date().toISOString();
        }
        await persist();
        return true;
      } catch (stepErr) {
        step.status = 'failed';
        step.error = (stepErr as Error).message;
        await persist({ status: 'blocked', current_step: key });
        return false;
      }
    };

    // Execute steps in order from the resume point. schedule_intro_email depends
    // only on the clock, so it runs even though the external steps before it are
    // still pending.
    for (let i = startIndex; i < STEP_ORDER.length; i++) {
      const ok = await runStep(STEP_ORDER[i]);
      if (!ok) {
        try {
          const btplList = await svc.entities.OnboardingEmailTemplate.filter({ event: 'blocked' });
          const btpl = (Array.isArray(btplList) ? btplList : [])[0] || null;
          if (btpl && btpl.enabled !== false) {
            let recips: string[] = [];
            try { recips = JSON.parse(btpl.recipients || '[]'); } catch { recips = []; }
            recips = (Array.isArray(recips) ? recips : []).map((r) => String(r).trim()).filter(Boolean);
            if (recips.length > 0) {
              const bbuyer = buyerId ? await svc.entities.Buyer.get(buyerId).catch(() => null) : null;
              const failed = steps.find((s) => s.status === 'failed');
              const bvars: Record<string, string> = {
                company_name: (bbuyer && bbuyer.company_name) || str(payload.company_name) || onboarding.company_name || '',
                buyer_code: (bbuyer && bbuyer.buyer_code) || '',
                vertical: (bbuyer && bbuyer.vertical) || str(payload.vertical) || '',
                failed_step: failed ? String(failed.key) : String(STEP_ORDER[i]),
                contact_name: str(payload.primary_contact_name) || 'there',
              };
              const brender = (s: unknown) => String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in bvars ? String(bvars[k]) : ''));
              for (const to of recips) {
                await base44.asServiceRole.functions.invoke('sendGmail', { to, subject: brender(btpl.subject), body: brender(btpl.body) });
              }
            }
          }
        } catch (_e) {
          // Non-fatal: a failed alert must not change the blocked outcome.
        }
        return Response.json({
          onboarding_id: onboardingId,
          status: 'blocked',
          steps,
          intro_email_scheduled_for: introEmailTime,
        }, { status: 200 });
      }
    }

    // Every step ran without blocking. If all are complete or skipped, the
    // onboarding is complete; otherwise it stays in_progress.
    const allDone = steps.every((s) => s.status === 'complete' || s.status === 'skipped');
    const finalStatus = allDone ? 'complete' : 'in_progress';
    const patch: Record<string, any> = { current_step: null, status: finalStatus };
    if (allDone) patch.completed_at = new Date().toISOString();
    await persist(patch);

    return Response.json({
      onboarding_id: onboardingId,
      status: finalStatus,
      steps,
      intro_email_scheduled_for: introEmailTime,
    }, { status: 200 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});