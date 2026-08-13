// Browser-safe, DRY-RUN helpers for the Campaigns > Deliveries UI. These build a
// payload preview and classify a pasted sample response WITHOUT sending anything.
// They reuse the exact canonical mapping/classification the real adapter uses, so
// what the operator previews is what would actually go out.
//
// Credentials are never present here: the preview shows a masked placeholder for
// the auth header, and the real secret is only ever added server-side at send time.

import { resolveSubDeliveryCfg } from './deliveryResolve.js';
import { applyTransform } from './transforms.js';
import { classifyResponse } from './deliveryAttempt.js';

function buildBody(leadData, fieldMap) {
  const out = {};
  for (const f of fieldMap || []) {
    let v = leadData[f.src];
    if (f.transform) v = applyTransform(v, f.transform);
    if (f.required && (v == null || v === '')) continue;
    if (v !== undefined) out[f.dest || f.src] = v;
  }
  return out;
}

// Build the exact outbound request preview for a SubDelivery + sample lead.
// credentialPresent: whether a credential_ref is set (shown as a masked header).
export function buildDeliveryPreview(subDelivery, sampleLead, { credentialPresent } = {}) {
  const cfg = resolveSubDeliveryCfg(subDelivery) || {};
  const payload = buildBody(sampleLead || {}, cfg.fieldMap);
  const headers = { ...(cfg.headers || {}) };
  if (credentialPresent ?? !!subDelivery?.credential_ref) headers.Authorization = '[resolved server-side at send time]';
  headers['Idempotency-Key'] = '[per-lead]';
  let body;
  if (cfg.encoding === 'form') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
    body = new URLSearchParams(payload).toString();
  } else {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = JSON.stringify(payload, null, 2);
  }
  return { url: cfg.targetUrl, method: cfg.method, encoding: cfg.encoding, headers, body };
}

// Classify a pasted sample response using the sub-delivery's response mapping.
// Returns { status, revenue, buyerLeadId }. Sends nothing.
export function classifySampleResponse(subDelivery, sample) {
  const cfg = resolveSubDeliveryCfg(subDelivery) || {};
  const mapping = cfg.responseMapping || {};
  const httpStatus = Number(sample?.httpStatus) || 200;
  const bodyText = String(sample?.body ?? '');
  const status = classifyResponse({
    httpStatus, body: bodyText,
    mapping: { accept: mapping.acceptRe, reject: mapping.rejectRe, duplicate: mapping.duplicateRe, queue: mapping.queueRe },
  });
  let parsed = null;
  try { parsed = JSON.parse(bodyText); } catch { parsed = null; }
  const get = (path) => (path ? String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), parsed) : undefined);
  return {
    status,
    revenue: status === 'accepted' && parsed ? Number(get(mapping.revenuePath)) || 0 : 0,
    buyerLeadId: parsed ? (get(mapping.leadIdPath) ?? null) : null,
  };
}
