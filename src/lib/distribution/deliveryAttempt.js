// Delivery attempt state machine + retry policy. Pure: `nowMs` passed in.
// A secondary failure must never overwrite a valid primary Sold/Unsold outcome,
// so the caller keeps primary and secondary attempts separate; this module only
// classifies responses, computes backoff, and builds redacted attempt records.

import { redact } from './engine.js';

export const ATTEMPT_STATUS = {
  PENDING: 'pending', SENT: 'sent', ACCEPTED: 'accepted', REJECTED: 'rejected',
  DUPLICATE: 'duplicate', QUEUED: 'queued', ERROR: 'error', DEAD_LETTER: 'dead_letter',
};

// Statuses that represent a settled outcome (never retried).
const TERMINAL = new Set([
  ATTEMPT_STATUS.ACCEPTED, ATTEMPT_STATUS.REJECTED, ATTEMPT_STATUS.DUPLICATE, ATTEMPT_STATUS.DEAD_LETTER,
]);

// Bounded exponential backoff (deterministic, no ambient time/jitter).
export function computeBackoffMs(attemptNumber, opts = {}) {
  const base = opts.baseMs ?? 1000;
  const factor = opts.factor ?? 2;
  const max = opts.maxMs ?? 60 * 60 * 1000; // 1h cap
  const n = Math.max(1, attemptNumber);
  return Math.min(max, base * Math.pow(factor, n - 1));
}

export function nextRetryAtIso(nowMs, attemptNumber, opts = {}) {
  return new Date(nowMs + computeBackoffMs(attemptNumber, opts)).toISOString();
}

// Retry only transient failures, up to maxAttempts. Settled outcomes never retry.
export function shouldRetry(status, attemptNumber, maxAttempts = 5) {
  if (TERMINAL.has(status)) return false;
  if (status === ATTEMPT_STATUS.ACCEPTED) return false;
  const retryable = status === ATTEMPT_STATUS.ERROR || status === ATTEMPT_STATUS.QUEUED;
  return retryable && attemptNumber < maxAttempts;
}

// Classify a destination response into an attempt status. `mapping` optionally
// supplies regexes for duplicate/reject/queue detection in the body text.
export function classifyResponse({ httpStatus, body, error, mapping = {} } = {}) {
  if (error) return ATTEMPT_STATUS.ERROR;
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  const test = (re) => { try { return re && new RegExp(re, 'i').test(text); } catch { return false; } };

  if (mapping.duplicate && test(mapping.duplicate)) return ATTEMPT_STATUS.DUPLICATE;
  if (mapping.reject && test(mapping.reject)) return ATTEMPT_STATUS.REJECTED;
  if (mapping.queue && test(mapping.queue)) return ATTEMPT_STATUS.QUEUED;
  if (mapping.accept && test(mapping.accept)) return ATTEMPT_STATUS.ACCEPTED;

  if (httpStatus == null) return ATTEMPT_STATUS.ERROR;
  if (httpStatus >= 200 && httpStatus < 300) {
    // When acceptance is authoritative (requireAccept) and the accept pattern did
    // not match above, a 2xx is NOT a sale: the buyer echoed OK but did not
    // confirm acceptance, so treat it as a rejection rather than a false Sold.
    if (mapping.requireAccept && mapping.accept) return ATTEMPT_STATUS.REJECTED;
    return ATTEMPT_STATUS.ACCEPTED;
  }
  if (httpStatus === 409) return ATTEMPT_STATUS.DUPLICATE;
  if (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500) return ATTEMPT_STATUS.ERROR;
  if (httpStatus >= 400) return ATTEMPT_STATUS.REJECTED;
  return ATTEMPT_STATUS.ERROR;
}

// Build a persisted attempt record with secrets redacted and PII minimized.
export function buildAttemptRecord({
  leadId, destinationId, trigger, attemptNumber = 1, idempotencyKey, isPrimary = false,
  status, request = {}, response = {}, httpStatus = null, latencyMs = null, errorClass = null,
  nowMs = 0, retryOpts = {},
}) {
  const willRetry = shouldRetry(status, attemptNumber, retryOpts.maxAttempts ?? 5);
  const finalStatus = (!willRetry && (status === ATTEMPT_STATUS.ERROR || status === ATTEMPT_STATUS.QUEUED)
    && attemptNumber >= (retryOpts.maxAttempts ?? 5)) ? ATTEMPT_STATUS.DEAD_LETTER : status;
  return {
    lead_id: leadId,
    destination_id: destinationId,
    trigger: trigger ?? null,
    attempt_number: attemptNumber,
    idempotency_key: idempotencyKey ?? null,
    is_primary: !!isPrimary,
    status: finalStatus,
    request_meta: JSON.stringify(redact(minimizeRequest(request))),
    response_meta: JSON.stringify(minimizeResponse(response)),
    http_status: httpStatus,
    latency_ms: latencyMs,
    error_class: errorClass,
    next_retry_at: willRetry ? nextRetryAtIso(nowMs, attemptNumber, retryOpts) : null,
    completed_at: new Date(nowMs).toISOString(),
  };
}

function minimizeRequest(req) {
  // keep method/url/headers (redacted downstream) but never the raw PII body verbatim
  return { method: req.method, url: req.url, headers: req.headers, body_present: req.body != null };
}
function minimizeResponse(res) {
  const text = typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? {});
  return { status: res.status ?? null, body_excerpt: text.slice(0, 500) };
}
