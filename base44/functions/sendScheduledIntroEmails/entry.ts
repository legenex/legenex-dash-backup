import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Scheduled sender for the buyer intro email from James.
//
// onboardBuyer resolves a send time and stores it on
// BuyerOnboarding.intro_email_scheduled_for. This job runs every 15 minutes,
// finds records whose scheduled time is now or in the past that have not yet
// been sent, and sends the intro email through the connected Gmail account.
//
// Sent state is tracked inside the existing steps array (the schema is fixed in
// this build) as a step with key intro_email_sent. A record whose steps already
// contain intro_email_sent complete is skipped so a second run never sends the
// intro email twice. On failure the step records the error and attempts, leaving
// intro_email_scheduled_for set so the next run retries; after 5 failures the
// step is marked failed so it is visible rather than looping forever.
//
// Credentials are never hardcoded and never written into a log, an error, or a
// stored record. The Gmail access token comes from the connected Gmail account.

const INTRO_STEP_KEY = 'intro_email_sent';
const MAX_ATTEMPTS = 5;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim());
}

// Base64url-encode a UTF-8 string for the Gmail API raw field.
function base64url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 2047 B-encode non-ASCII header values.
function encodeHeader(input: string): string {
  if (/^[\x00-\x7F]*$/.test(input)) return input;
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

// Intro email subject and body, selected by the buyer's vertical. James is the
// named sender. No em dashes anywhere in these strings.
function buildIntroEmail(vertical: string, contactName: string, companyName: string): { subject: string; body: string } {
  const subjectByVertical: Record<string, string> = {
    mva: 'Getting started with your Motor Vehicle Accident leads',
    workers_comp: 'Getting started with your Workers Comp leads',
    debt: 'Getting started with your Debt leads',
  };
  const subject = subjectByVertical[vertical] || 'Getting started with Legenex';
  const body = `Hi ${contactName},\n\n`
    + `I am James, your main point of contact at Legenex. I wanted to reach out personally now that ${companyName || 'your account'} is set up.\n\n`
    + `Over the next few days we will get your first leads flowing and I will be on hand to make sure everything runs smoothly. If anything comes up, just reply to this email and it comes straight to me.\n\n`
    + `Looking forward to working with you.\n\n`
    + `Best,\nJames\nLegenex`;
  return { subject, body };
}

// Send an email through the connected Gmail account. Returns the message id.
// Reads the access token from the connector, never from a hardcoded value.
async function sendViaGmail(svc: any, to: string, subject: string, body: string): Promise<string> {
  const { accessToken } = await svc.connectors.getConnection('gmail');
  const auth = { Authorization: `Bearer ${accessToken}` };

  let from = '';
  try {
    const pr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: auth });
    if (pr.ok) from = (await pr.json()).emailAddress || '';
  } catch { from = ''; }

  const headers: string[] = [];
  if (from) headers.push(`From: ${from}`);
  headers.push(`To: ${to}`);
  headers.push(`Subject: ${encodeHeader(subject)}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset=UTF-8');
  const rfc822 = headers.join('\r\n') + '\r\n\r\n' + body;

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64url(rfc822) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gmail send failed (HTTP ${res.status}).`);
  return data.id ? String(data.id) : 'sent';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow scheduled (no user) and admin-triggered runs only.
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch {
      // No user: scheduled run, allowed.
    }

    const svc = base44.asServiceRole;
    const nowIso = new Date().toISOString();

    // Candidates: intro_email_scheduled_for set and now or in the past. Paginate
    // so a large backlog is fully processed.
    const pageSize = 200;
    const candidates: any[] = [];
    let skip = 0;
    while (true) {
      const batch = await svc.entities.BuyerOnboarding.filter(
        { intro_email_scheduled_for: { $ne: null, $lte: nowIso } },
        '-intro_email_scheduled_for',
        pageSize,
        skip,
      );
      candidates.push(...batch);
      if (batch.length < pageSize) break;
      skip += pageSize;
    }

    const summary = { sent: 0, skipped: 0, failed: 0 };

    for (const rec of candidates) {
      let steps: any[] = [];
      try {
        steps = typeof rec.steps === 'string' ? JSON.parse(rec.steps || '[]') : (rec.steps || []);
      } catch { steps = []; }
      if (!Array.isArray(steps)) steps = [];

      const introStep = steps.find((s) => s && s.key === INTRO_STEP_KEY);

      // Already sent: skip so we never send twice.
      if (introStep && introStep.status === 'complete') {
        summary.skipped += 1;
        continue;
      }
      // Already capped out at max attempts and marked failed: leave it visible.
      if (introStep && introStep.status === 'failed') {
        summary.skipped += 1;
        continue;
      }

      let payload: any = {};
      try {
        payload = typeof rec.form_payload === 'string' ? JSON.parse(rec.form_payload || '{}') : (rec.form_payload || {});
      } catch { payload = {}; }

      // Resolve recipient and vertical from the buyer record when present, else
      // fall back to the raw form payload.
      let buyer: any = null;
      if (rec.buyer_id) {
        buyer = await svc.entities.Buyer.get(rec.buyer_id).catch(() => null);
      }
      const to = str(payload.primary_contact_email) || str(buyer?.email);
      const vertical = str(buyer?.vertical) || str(payload.vertical);
      const contactName = (str(payload.primary_contact_name).split(' ')[0]) || 'there';
      const companyName = str(payload.company_name) || str(buyer?.company_name) || str(rec.company_name);

      const priorAttempts = introStep ? (Number(introStep.attempts) || 0) : 0;

      const writeStep = (patch: Record<string, any>) => {
        const next = steps.filter((s) => !(s && s.key === INTRO_STEP_KEY));
        next.push({
          key: INTRO_STEP_KEY,
          status: patch.status,
          attempts: patch.attempts,
          error: patch.error ?? null,
          external_id: patch.external_id ?? null,
          completed_at: patch.completed_at ?? null,
        });
        steps = next;
      };

      if (!to) {
        // No recipient: this can never succeed. Record the reason and count it
        // against the attempt cap so it does not loop forever.
        const attempts = priorAttempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        writeStep({ status: failed ? 'failed' : 'pending', attempts, error: 'No recipient email on the onboarding record.' });
        await svc.entities.BuyerOnboarding.update(rec.id, { steps: JSON.stringify(steps) }).catch(() => {});
        summary.failed += 1;
        continue;
      }

      try {
        const { subject, body } = buildIntroEmail(vertical, contactName, companyName);
        const messageId = await sendViaGmail(svc, to, subject, body);
        writeStep({
          status: 'complete',
          attempts: priorAttempts + 1,
          error: null,
          external_id: messageId,
          completed_at: new Date().toISOString(),
        });
        await svc.entities.BuyerOnboarding.update(rec.id, { steps: JSON.stringify(steps) });
        summary.sent += 1;
      } catch (err) {
        const attempts = priorAttempts + 1;
        const capped = attempts >= MAX_ATTEMPTS;
        // Record the error on the step. Leave intro_email_scheduled_for set so a
        // non-capped failure retries next run. After the cap, mark failed.
        writeStep({
          status: capped ? 'failed' : 'pending',
          attempts,
          error: (err as Error).message,
        });
        await svc.entities.BuyerOnboarding.update(rec.id, { steps: JSON.stringify(steps) }).catch(() => {});
        summary.failed += 1;
      }
    }

    return Response.json({ status: 'ok', ...summary, processed: candidates.length });
  } catch (error) {
    return Response.json({ status: 'error', error: (error as Error).message }, { status: 500 });
  }
});