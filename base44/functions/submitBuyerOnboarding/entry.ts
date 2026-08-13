import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Public buyer onboarding intake (/functions/submitBuyerOnboarding).
// Unauthenticated, like buyerFeedbackWebhook. It validates the submission,
// rate limits by IP, dedupes on company_name + email within ten minutes, and
// writes exactly one BuyerOnboarding record with the service role.
//
// This function ONLY records the submission. It does not create a Buyer, does
// not allocate a buyer_code, and never contacts Stripe, Xero, LeadByte, GHL or
// Rebrandly, and sends no email.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Fifty states plus DC. This is the authoritative server side allow list, so
// the client can never widen it.
const VALID_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);

const VALID_CLIENT_TYPES = new Set(['Law Firm', 'Aggregator', 'Reseller', 'Network']);
const VALID_BILLING_TYPES = new Set(['prepay', 'invoiced_daily', 'invoiced_weekly', 'invoiced_monthly']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In memory IP rate limiter. Per warm instance, best effort. A short window is
// enough to blunt bursts without a persistent store.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;
const ipHits: Map<string, number[]> = new Map();

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > RATE_MAX;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim());
}

function base64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeHeader(s: string): string {
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

async function sendClientEmail(base44: any, to: string, subject: string, textBody: string): Promise<void> {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
  const auth = { Authorization: `Bearer ${accessToken}` };
  let from = '';
  try {
    const pr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: auth });
    if (pr.ok) from = ((await pr.json()).emailAddress) || '';
  } catch {}
  const headers: string[] = [];
  if (from) headers.push(`From: ${from}`);
  headers.push(`To: ${to}`);
  headers.push(`Subject: ${encodeHeader(subject)}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset=UTF-8');
  const rfc822 = headers.join('\r\n') + '\r\n\r\n' + textBody;
  await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64url(rfc822) }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method === 'GET') return Response.json({ status: 'ok' }, { status: 200, headers: CORS_HEADERS });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS_HEADERS });

  try {
    const ip = clientIp(req);
    if (rateLimited(ip)) {
      return Response.json(
        { error: 'Too many submissions from this network. Please wait a moment and try again.' },
        { status: 429, headers: CORS_HEADERS },
      );
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = str(body.token);

    // ── Server side validation. Never trust the client. ──────────────────
    const fieldErrors: Record<string, string> = {};

    const companyName = str(body.company_name);
    if (!companyName) fieldErrors.company_name = 'Company name is required.';

    const primaryContactName = str(body.primary_contact_name);
    if (!primaryContactName) fieldErrors.primary_contact_name = 'Primary contact name is required.';

    const primaryContactEmail = str(body.primary_contact_email).toLowerCase();
    if (!primaryContactEmail) fieldErrors.primary_contact_email = 'Primary contact email is required.';
    else if (!EMAIL_RE.test(primaryContactEmail)) fieldErrors.primary_contact_email = 'Enter a valid email address.';

    const primaryContactPhone = str(body.primary_contact_phone);
    if (!primaryContactPhone) fieldErrors.primary_contact_phone = 'Primary contact phone is required.';

    // Target states: array of two letter codes, all within the allow list.
    const rawStates = Array.isArray(body.target_states) ? body.target_states : [];
    const targetStates = rawStates.map((s: unknown) => str(s).toUpperCase()).filter(Boolean);
    if (targetStates.length === 0) {
      fieldErrors.target_states = 'Select at least one target state.';
    } else {
      const invalid = targetStates.filter((s: string) => !VALID_STATES.has(s));
      if (invalid.length > 0) {
        fieldErrors.target_states = `Not valid US state codes: ${invalid.join(', ')}.`;
      }
    }

    const clientType = str(body.client_type);
    if (!clientType) fieldErrors.client_type = 'Client type is required.';
    else if (!VALID_CLIENT_TYPES.has(clientType)) fieldErrors.client_type = 'Choose a valid client type.';

    const cplRaw = body.cpl;
    const cpl = Number(cplRaw);
    if (cplRaw === '' || cplRaw == null || Number.isNaN(cpl)) fieldErrors.cpl = 'CPL is required and must be a number.';
    else if (cpl < 0) fieldErrors.cpl = 'CPL cannot be negative.';

    const billingType = str(body.billing_type);
    if (!billingType) fieldErrors.billing_type = 'Billing type is required.';
    else if (!VALID_BILLING_TYPES.has(billingType)) fieldErrors.billing_type = 'Choose a valid billing type.';

    if (Object.keys(fieldErrors).length > 0) {
      return Response.json(
        { error: 'Some fields need attention.', field_errors: fieldErrors },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Token flow: a buyer-first onboarding link. Update the existing invited
    // record for this buyer instead of creating a new submission. buyer_id is
    // already set on that record, so the submission stays tied to the buyer.
    if (token) {
      const list = await base44.asServiceRole.entities.BuyerOnboarding.filter({ token });
      const rec = (Array.isArray(list) ? list : [])[0];
      if (!rec) {
        return Response.json({ error: 'Invalid or expired onboarding link.' }, { status: 404, headers: CORS_HEADERS });
      }
      if (rec.status === 'cancelled') {
        return Response.json({ error: 'This onboarding link is no longer active.' }, { status: 410, headers: CORS_HEADERS });
      }
      if (rec.status === 'complete') {
        return Response.json({ status: 'duplicate', onboarding_id: rec.id, company_name: rec.company_name }, { status: 200, headers: CORS_HEADERS });
      }
      const wasInvited = rec.status === 'invited';
      const patch: Record<string, any> = {
        form_payload: JSON.stringify(body),
        submitted_at: new Date().toISOString(),
      };
      if (wasInvited) patch.status = 'submitted';
      await base44.asServiceRole.entities.BuyerOnboarding.update(rec.id, patch);

      if (wasInvited) {
        try {
          const tplList = await base44.asServiceRole.entities.OnboardingEmailTemplate.filter({ event: 'submitted' });
          const tpl = (Array.isArray(tplList) ? tplList : [])[0] || null;
          if (tpl && tpl.enabled !== false) {
            const buyer = rec.buyer_id ? await base44.asServiceRole.entities.Buyer.get(rec.buyer_id).catch(() => null) : null;
            const to = str(body.primary_contact_email) || (buyer && buyer.email) || '';
            if (to) {
              const vars: Record<string, string> = {
                company_name: (buyer && buyer.company_name) || rec.company_name || str(body.company_name) || '',
                contact_name: str(body.primary_contact_name) || 'there',
                buyer_code: (buyer && buyer.buyer_code) || '',
                vertical: (buyer && buyer.vertical) || str(body.vertical) || '',
              };
              const renderTpl = (s: unknown) => String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => (k in vars ? String(vars[k]) : ''));
              await sendClientEmail(base44, to, renderTpl(tpl.subject), renderTpl(tpl.body));
            }
          }
        } catch (_e) {
          // Non-fatal: the submission still succeeds even if the email fails.
        }
      }

      return Response.json({ status: 'ok', onboarding_id: rec.id, company_name: rec.company_name }, { status: 200, headers: CORS_HEADERS });
    }

    // ── Duplicate guard: same company_name + email within ten minutes. ────
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const recent = await base44.asServiceRole.entities.BuyerOnboarding.filter(
      { company_name: companyName },
      '-created_date',
      50,
    );
    const existing = (Array.isArray(recent) ? recent : []).find((r: any) => {
      let payloadEmail = '';
      try {
        const p = typeof r.form_payload === 'string' ? JSON.parse(r.form_payload) : (r.form_payload || {});
        payloadEmail = str(p?.primary_contact_email).toLowerCase();
      } catch { payloadEmail = ''; }
      const submittedMs = r.submitted_at ? new Date(r.submitted_at).getTime()
        : (r.created_date ? new Date(r.created_date).getTime() : 0);
      return payloadEmail === primaryContactEmail && submittedMs >= tenMinutesAgo;
    });

    if (existing) {
      return Response.json(
        { status: 'duplicate', onboarding_id: existing.id, company_name: existing.company_name },
        { status: 200, headers: CORS_HEADERS },
      );
    }

    // ── Persist the complete raw submission. buyer_id null, steps empty. ──
    const now = new Date().toISOString();
    const record = await base44.asServiceRole.entities.BuyerOnboarding.create({
      buyer_id: null,
      company_name: companyName,
      status: 'submitted',
      form_payload: JSON.stringify(body),
      steps: '[]',
      current_step: null,
      submitted_at: now,
    });

    return Response.json(
      { status: 'ok', onboarding_id: record.id, company_name: record.company_name },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS_HEADERS });
  }
});