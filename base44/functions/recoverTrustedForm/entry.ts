import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CERT_RE = /^https?:\/\/cert\.trustedform\.com\/[0-9a-fA-F]{40}(\?.*)?$/;
const CERT_EXTRACT_RE = /https:\/\/cert\.trustedform\.com\/[0-9a-fA-F]{40}/g;

function isValidCert(url) {
  if (!url || typeof url !== 'string') return false;
  return CERT_RE.test(url.trim());
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) d = '1' + d;
  return d;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole;

  if (req.method === 'GET') return Response.json({ status: 'ok' }, { status: 200 });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  // Auth: admin-only from UI; service role (scheduled automation) proceeds
  try {
    const user = await base44.auth.me();
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }
  } catch {}

  try {
    const body = await req.json().catch(() => ({}));
    const leadId = body.lead_id;

    let leadsToRecover = [];

    if (leadId) {
      const found = await db.entities.Lead.filter({ id: leadId });
      if (found.length === 0) return Response.json({ error: 'Lead not found' }, { status: 404 });
      leadsToRecover = [found[0]];
    } else {
      // Batch: find queued, non-archived leads with cert-related issues
      const queued = await db.entities.Lead.filter(
        { final_status: 'Queued', archived: false }, '-created_date', 50
      );
      leadsToRecover = queued.filter(l => {
        const reason = (l.queue_reason || '').toLowerCase();
        let rawUrl = '';
        try { rawUrl = JSON.parse(l.raw_payload || '{}').trustedform_url || ''; } catch {}
        return reason.includes('trustedform') || reason.includes('cert') || !isValidCert(rawUrl);
      });
    }

    const results = [];
    for (const lead of leadsToRecover) {
      try {
        const r = await recoverLeadCert(db, lead);
        results.push({ lead_id: lead.id, email: lead.email, ...r });
      } catch (err) {
        results.push({ lead_id: lead.id, email: lead.email, success: false, error: err.message });
      }
    }

    return Response.json({
      total: results.length,
      recovered: results.filter(r => r.success).length,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function recoverLeadCert(db, lead) {
  let rawPayload = {};
  try { rawPayload = JSON.parse(lead.raw_payload || '{}'); } catch {}

  const normEmail = normalizeEmail(rawPayload.email || lead.email);
  const normPhone = normalizePhone(rawPayload.mobile || lead.mobile || rawPayload.phone || '');

  let recoveredCertUrl = null;
  let certSource = '';

  // ── Step 1: Check CertBackupStore (fast, reliable path) ──
  if (normEmail || normPhone) {
    const matchKeys = [normEmail, normPhone].filter(Boolean);
    for (const k of matchKeys) {
      const backups = await db.entities.CertBackupStore.filter({ lead_match_key: k });
      if (backups.length > 0 && isValidCert(backups[0].trustedform_url)) {
        recoveredCertUrl = backups[0].trustedform_url;
        certSource = 'backup_store';
        break;
      }
    }
  }

  // ── Step 2: Fetch optin_url and extract cert from page content ──
  if (!recoveredCertUrl) {
    const optinUrl = rawPayload.optin_url || rawPayload.optinurl || '';
    if (!optinUrl || !/^https?:\/\//.test(optinUrl)) {
      return { success: false, error: 'No optin_url found and no backup cert available' };
    }

    // Build fetch URL with geo context (state, zip) as query params
    let fetchUrl = optinUrl;
    const params = new URLSearchParams();
    const state = rawPayload.state || rawPayload.geo_state || '';
    const zip = rawPayload.zip || rawPayload.geo_zip || '';
    if (state) params.set('state', state);
    if (zip) params.set('zip', zip);
    if ([...params].length > 0) {
      fetchUrl += (optinUrl.includes('?') ? '&' : '?') + params.toString();
    }

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15000);
    let html = '', finalUrl = '', httpStatus = null;

    try {
      const resp = await fetch(fetchUrl, {
        headers: {
          'User-Agent': rawPayload.user_agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(tid);
      httpStatus = resp.status;
      finalUrl = resp.url || fetchUrl;
      html = await resp.text();
    } catch (err) {
      clearTimeout(tid);
      return { success: false, error: `Fetch failed: ${err.message}`, optin_url: optinUrl };
    }

    // Check final URL (after redirects) for cert pattern
    const urlMatch = finalUrl.match(/https:\/\/cert\.trustedform\.com\/[0-9a-fA-F]{40}/);
    if (urlMatch) {
      recoveredCertUrl = urlMatch[0];
      certSource = 'optin_url_redirect';
    }

    // Check HTML content for cert pattern
    if (!recoveredCertUrl) {
      const htmlMatches = html.match(CERT_EXTRACT_RE);
      if (htmlMatches && htmlMatches.length > 0) {
        recoveredCertUrl = htmlMatches[0];
        certSource = 'optin_url_html';
      }
    }

    if (!recoveredCertUrl) {
      return {
        success: false,
        error: 'No TrustedForm cert URL found in optin_url page content',
        optin_url: optinUrl,
        http_status: httpStatus,
      };
    }
  }

  // ── Step 3: Update lead tracking + create AuditLog ──
  // cert_source and trustedform_valid are set on the queued lead for audit trail.
  // The frontend will patch raw_payload and re-invoke processLead separately.
  await db.entities.Lead.update(lead.id, {
    cert_source: certSource,
    trustedform_valid: true,
  }).catch(() => {});

  await db.entities.AuditLog.create({
    lead_id: lead.id,
    lead_match_key: normEmail || normPhone || '',
    recovered_cert_url: recoveredCertUrl,
    cert_source: certSource,
    backfilled_at: new Date().toISOString(),
  }).catch(() => {});

  return { success: true, recovered_cert_url: recoveredCertUrl, cert_source: certSource };
}