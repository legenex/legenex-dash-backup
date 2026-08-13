import { describe, it, expect } from 'vitest';
import { selectProvider, acceptWebhookEvent, verifyAndAccept, PROVIDER } from './providers.js';

describe('selectProvider (deliberate, documented)', () => {
  it('honors an explicit buyer override', () => {
    expect(selectProvider({ payment_provider: 'xero' }, 'wallet_topup')).toBe(PROVIDER.XERO);
  });
  it('routes wallet actions to Stripe and invoices to Xero', () => {
    expect(selectProvider({}, 'wallet_topup')).toBe(PROVIDER.STRIPE);
    expect(selectProvider({}, 'recharge')).toBe(PROVIDER.STRIPE);
    expect(selectProvider({}, 'invoice')).toBe(PROVIDER.XERO);
  });
  it('falls back on billing_type when no action override', () => {
    expect(selectProvider({ billing_type: 'prepay' }, 'charge')).toBe(PROVIDER.STRIPE);
    expect(selectProvider({ billing_type: 'invoiced_monthly' }, 'charge')).toBe(PROVIDER.XERO);
  });
});

describe('acceptWebhookEvent (replay protection)', () => {
  function makeStore() { const s = new Set(); return { async has(id) { return s.has(id); }, async add(id) { s.add(id); } }; }
  it('processes once then rejects replays', async () => {
    const store = makeStore();
    expect((await acceptWebhookEvent(store, 'evt_1')).process).toBe(true);
    expect((await acceptWebhookEvent(store, 'evt_1')).process).toBe(false);
  });
  it('rejects missing event id', async () => {
    expect((await acceptWebhookEvent(makeStore(), '')).process).toBe(false);
  });
});

describe('verifyAndAccept (never trusts unverified events)', () => {
  function makeStore() { const s = new Set(); return { async has(id) { return s.has(id); }, async add(id) { s.add(id); } }; }
  const verifyFn = async (payload, sig, secret) => sig === `valid-${secret}`;
  it('rejects unsigned and bad signatures', async () => {
    const store = makeStore();
    expect((await verifyAndAccept(store, { eventId: 'e', payload: {}, signature: '', secret: 's', verifyFn })).reason).toBe('unsigned');
    expect((await verifyAndAccept(store, { eventId: 'e', payload: {}, signature: 'nope', secret: 's', verifyFn })).reason).toBe('bad_signature');
  });
  it('accepts a valid signature once, then treats replays as handled', async () => {
    const store = makeStore();
    const first = await verifyAndAccept(store, { eventId: 'e1', payload: {}, signature: 'valid-s', secret: 's', verifyFn });
    expect(first.process).toBe(true);
    const replay = await verifyAndAccept(store, { eventId: 'e1', payload: {}, signature: 'valid-s', secret: 's', verifyFn });
    expect(replay.process).toBe(false);
    expect(replay.reason).toBe('replay');
  });
});
