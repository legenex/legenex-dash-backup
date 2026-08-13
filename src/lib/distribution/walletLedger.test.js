import { describe, it, expect } from 'vitest';
import { walletDebit, walletCredit, walletCreditReturn, WALLET } from './walletLedger.js';
import { makeInMemoryWalletStore } from './walletStore.js';

describe('wallet ledger (versioned CAS, idempotent, concurrency-safe)', () => {
  it('parallel debits (distinct keys) lose no updates', async () => {
    const s = makeInMemoryWalletStore({ initial: { B1: 1000 } });
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      walletDebit(s, { buyerId: 'B1', amount: 10, idempotencyKey: 'k' + i })));
    expect((await s.getBalance('B1')).balance).toBe(800);
    expect(s._debug.txns.filter((t) => t.status === 'applied')).toHaveLength(20);
  });

  it('duplicate idempotency key debits exactly once (10 concurrent)', async () => {
    const s = makeInMemoryWalletStore({ initial: { B1: 1000 } });
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      walletDebit(s, { buyerId: 'B1', amount: 25, idempotencyKey: 'same' })));
    expect((await s.getBalance('B1')).balance).toBe(975); // debited once
    expect(results.filter((r) => r.applied).length).toBe(1);
    expect(results.filter((r) => r.duplicate).length).toBe(9);
    expect(s._debug.txns.filter((t) => t.status === 'applied')).toHaveLength(1);
  });

  it('accepted delivery debits exactly once; a not-issued debit changes nothing', async () => {
    const s = makeInMemoryWalletStore({ initial: { B1: 100 } });
    // "failed delivery debits nothing": simply never call debit -> balance intact
    expect((await s.getBalance('B1')).balance).toBe(100);
    // accepted: one debit
    const r = await walletDebit(s, { buyerId: 'B1', amount: 40, idempotencyKey: 'lead1:m1' });
    expect(r.applied).toBe(true);
    expect((await s.getBalance('B1')).balance).toBe(60);
  });

  it('ambiguous outcome cannot double-debit (same key retried)', async () => {
    const s = makeInMemoryWalletStore({ initial: { B1: 100 } });
    const a = await walletDebit(s, { buyerId: 'B1', amount: 40, idempotencyKey: 'lead1:m1' });
    const b = await walletDebit(s, { buyerId: 'B1', amount: 40, idempotencyKey: 'lead1:m1' });
    expect(a.applied).toBe(true);
    expect(b.duplicate).toBe(true);
    expect((await s.getBalance('B1')).balance).toBe(60);
  });

  it('repeated return webhook credits exactly once', async () => {
    const s = makeInMemoryWalletStore({ initial: { B1: 0 } });
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      walletCreditReturn(s, { buyerId: 'B1', amount: 15, returnId: 'r1' })));
    expect((await s.getBalance('B1')).balance).toBe(15);
    expect(results.filter((r) => r.applied).length).toBe(1);
  });

  it('balance never goes negative without a credit limit (concurrent)', async () => {
    const s = makeInMemoryWalletStore({ initial: { B1: 50 } });
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) =>
      walletDebit(s, { buyerId: 'B1', amount: 10, idempotencyKey: 'k' + i })));
    expect((await s.getBalance('B1')).balance).toBe(0); // exactly 5 of 25 succeed
    expect(results.filter((r) => r.applied).length).toBe(5);
    expect(results.filter((r) => r.code === WALLET.LOW_BALANCE).length).toBe(20);
  });

  it('credit limit holds under concurrency (never below -limit)', async () => {
    const s = makeInMemoryWalletStore({ initial: { B1: 0 } });
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) =>
      walletDebit(s, { buyerId: 'B1', amount: 10, idempotencyKey: 'k' + i, creditLimit: 100 })));
    expect((await s.getBalance('B1')).balance).toBe(-100); // down to the limit, not past
    expect(results.filter((r) => r.applied).length).toBe(10);
    expect(results.filter((r) => r.code === WALLET.OVER_CREDIT_LIMIT).length).toBe(15);
  });

  it('a rejected debit does not move the balance', async () => {
    const s = makeInMemoryWalletStore({ initial: { B1: 5 } });
    const r = await walletDebit(s, { buyerId: 'B1', amount: 25, idempotencyKey: 'k' });
    expect(r.applied).toBe(false);
    expect(r.code).toBe(WALLET.LOW_BALANCE);
    expect((await s.getBalance('B1')).balance).toBe(5);
  });
});
