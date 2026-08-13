// Payment provider abstraction + webhook replay protection. Pure/DI so it is
// testable and reused by the Base44 backend. Sandbox keys only in development; no
// live customer, charge, invoice, or webhook is performed here. The actual HTTP
// calls and signature crypto live in the backend adapters; this module encodes
// the deliberate provider-selection policy and idempotency/replay rules that must
// never be silently guessed.

export const PROVIDER = { STRIPE: 'stripe', XERO: 'xero' };

// Deliberate, documented per-buyer selection. Prepaid/wallet buyers collect and
// recharge through Stripe (hosted); postpaid/invoiced buyers are billed through
// Xero. An explicit buyer.payment_provider override always wins. Never inferred
// silently: an unknown/missing config falls back to Stripe for wallet actions and
// Xero for invoicing, and the caller records which was used.
export function selectProvider(buyer, action) {
  const b = buyer || {};
  const override = String(b.payment_provider || '').trim().toLowerCase();
  if (override === PROVIDER.STRIPE || override === PROVIDER.XERO) return override;
  if (action === 'invoice') return PROVIDER.XERO;
  if (action === 'wallet_topup' || action === 'recharge') return PROVIDER.STRIPE;
  const billingType = String(b.billing_type || '').toLowerCase();
  if (billingType.startsWith('prepay')) return PROVIDER.STRIPE;
  if (billingType.startsWith('invoice')) return PROVIDER.XERO;
  return action === 'invoice' ? PROVIDER.XERO : PROVIDER.STRIPE;
}

// Webhook replay protection / event idempotency. `store.has(eventId)` and
// `store.add(eventId)` back a processed-events set (unique index in production).
// Returns { process: boolean } - false means already handled, skip safely.
export async function acceptWebhookEvent(store, eventId) {
  if (!eventId) return { process: false, reason: 'missing_event_id' };
  if (await store.has(eventId)) return { process: false, reason: 'replay' };
  await store.add(eventId);
  return { process: true };
}

// Signature verification contract. The backend injects a verify function that
// does the provider-specific HMAC/crypto; this wrapper enforces that an event is
// rejected when verification fails or the signature/secret is missing. It never
// trusts an unverified event.
export async function verifyAndAccept(store, { eventId, payload, signature, secret, verifyFn }) {
  if (!signature || !secret) return { process: false, reason: 'unsigned' };
  let ok = false;
  try { ok = await verifyFn(payload, signature, secret); } catch { ok = false; }
  if (!ok) return { process: false, reason: 'bad_signature' };
  return acceptWebhookEvent(store, eventId);
}
