// Backend direct-post delivery adapter. Builds the outbound request (method,
// JSON or form encoding, headers, field mapping, transforms), enforces a host
// allowlist in test mode, persists a DeliveryAttempt BEFORE sending, sends with a
// timeout and manual redirect handling, classifies the response, extracts revenue
// and the buyer lead id, and stores a redacted, completed attempt record.
//
// Pure of ambient time and network: fetchImpl and nowMs are injected, so the same
// adapter runs in Deno (production) and in npm test against a local mock server.

import { classifyResponse, buildAttemptRecord, ATTEMPT_STATUS } from './deliveryAttempt.js';
import { applyTransform } from './transforms.js';

function getPath(obj, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function isLocalhost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

// Map lead fields into the outbound payload using a field map + optional transforms.
// fieldMap: [{ src, dest, transform }]; conditional fields dropped when empty.
function buildPayload(leadData, fieldMap) {
  const out = {};
  for (const f of fieldMap || []) {
    let v = leadData[f.src];
    if (f.transform) v = applyTransform(v, f.transform);
    if (f.required && (v == null || v === '')) continue; // conditional/required-empty dropped
    if (v !== undefined) out[f.dest || f.src] = v;
  }
  return out;
}

// cfg: { destinationId, targetUrl, method, encoding, headers, fieldMap, timeoutMs,
//        responseMapping:{acceptRe,rejectRe,duplicateRe,queueRe,revenuePath,leadIdPath},
//        idempotencyKey, leadData, leadId, attemptNumber, isPrimary, trigger, retryOpts }
// ctx: { store, nowMs, fetchImpl, testMode, allowlistHosts }
export async function deliverDirectPost(cfg, ctx) {
  const nowMs = ctx.nowMs ?? 0;
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;
  const attemptNumber = cfg.attemptNumber || 1;

  let url;
  try { url = new URL(cfg.targetUrl); } catch { return failClosed(ctx, cfg, nowMs, 'invalid_url', 'INVALID_URL'); }

  // Test-mode host allowlist: only localhost is permitted so no test can reach a
  // real buyer or arbitrary host.
  if (ctx.testMode) {
    const allowed = ctx.allowlistHosts || [];
    if (!isLocalhost(url.hostname) && !allowed.includes(url.hostname)) {
      return failClosed(ctx, cfg, nowMs, 'host_not_allowed', 'HOST_NOT_ALLOWED');
    }
  }

  const payload = buildPayload(cfg.leadData || {}, cfg.fieldMap);
  const encoding = cfg.encoding === 'form' ? 'form' : 'json';
  const headers = { ...(cfg.headers || {}) }; // NON-secret headers only (never carries a stored key)
  // CREDENTIAL HARD RULE: resolve the opaque credential_ref to real secret headers
  // HERE, server-side, at send time. The secret never lives in the SubDelivery
  // JSON, the snapshot, or any browser-facing shape. It exists only in this local
  // request header object for the duration of the send.
  if (cfg.credentialRef && typeof ctx.resolveCredential === 'function') {
    const resolved = await ctx.resolveCredential(cfg.credentialRef);
    if (resolved && typeof resolved === 'object') {
      for (const [k, v] of Object.entries(resolved)) { if (v != null) headers[k] = v; }
    }
  }
  headers['Idempotency-Key'] = cfg.idempotencyKey;
  let body;
  if (encoding === 'form') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
    body = new URLSearchParams(payload).toString();
  } else {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = JSON.stringify(payload);
  }

  // Persist the attempt BEFORE sending (durable record for crash recovery).
  const pending = await ctx.store.createAttempt({
    lead_id: cfg.leadId, sub_delivery_id: cfg.subDeliveryId || null, destination_id: cfg.destinationId, trigger: cfg.trigger || 'primary',
    attempt_number: attemptNumber, idempotency_key: cfg.idempotencyKey, is_primary: !!cfg.isPrimary,
    status: ATTEMPT_STATUS.PENDING, started_at: new Date(nowMs).toISOString(),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs || 10000);
  let httpStatus = null; let bodyText = ''; let errorClass = null;
  const t0 = nowMs;
  try {
    const resp = await fetchImpl(cfg.targetUrl, {
      method: cfg.method || 'POST', headers, body, redirect: 'manual', signal: controller.signal,
    });
    httpStatus = resp.status;
    bodyText = await resp.text();
  } catch (e) {
    errorClass = e && e.name === 'AbortError' ? 'timeout' : (e && e.message ? e.message.slice(0, 60) : 'network_error');
  } finally {
    clearTimeout(timer);
  }

  const mapping = cfg.responseMapping || {};
  const status = errorClass
    ? ATTEMPT_STATUS.ERROR
    : classifyResponse({ httpStatus, body: bodyText, mapping: {
        accept: mapping.acceptRe, reject: mapping.rejectRe, duplicate: mapping.duplicateRe, queue: mapping.queueRe,
        requireAccept: mapping.requireAccept,
      } });

  let parsed = null;
  try { parsed = JSON.parse(bodyText); } catch { parsed = null; }
  const revenue = status === ATTEMPT_STATUS.ACCEPTED && parsed ? Number(getPath(parsed, mapping.revenuePath)) || 0 : 0;
  const buyerLeadId = parsed ? getPath(parsed, mapping.leadIdPath) ?? null : null;

  const record = buildAttemptRecord({
    leadId: cfg.leadId, destinationId: cfg.destinationId, trigger: cfg.trigger, attemptNumber,
    idempotencyKey: cfg.idempotencyKey, isPrimary: cfg.isPrimary, status,
    request: { method: cfg.method || 'POST', url: cfg.targetUrl, headers, body },
    response: { status: httpStatus, body: bodyText }, httpStatus,
    latencyMs: (ctx.nowMs ?? 0) - t0, errorClass, nowMs, retryOpts: cfg.retryOpts,
  });
  await ctx.store.updateAttempt(pending.id, record);

  return {
    attemptId: pending.id, status: record.status, httpStatus, revenue, buyerLeadId,
    retryable: record.next_retry_at != null, nextRetryAt: record.next_retry_at, errorClass,
  };
}

async function failClosed(ctx, cfg, nowMs, errorClass, code) {
  const rec = await ctx.store.createAttempt({
    lead_id: cfg.leadId, destination_id: cfg.destinationId, attempt_number: cfg.attemptNumber || 1,
    idempotency_key: cfg.idempotencyKey, is_primary: !!cfg.isPrimary,
    status: ATTEMPT_STATUS.ERROR, error_class: errorClass, code,
    started_at: new Date(nowMs).toISOString(), completed_at: new Date(nowMs).toISOString(),
  });
  return { attemptId: rec.id, status: ATTEMPT_STATUS.ERROR, code, errorClass, retryable: false, revenue: 0, buyerLeadId: null };
}
