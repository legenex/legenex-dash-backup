import { describe, it, expect } from 'vitest';
import { computeBillingLines, applyReturnAdjustment } from './billing.js';

// Wallet debit/credit concurrency is covered in walletLedger.test.js (CAS ledger).

describe('computeBillingLines (returns counted once)', () => {
  const leads = [
    { id: 'L1', vertical: 'legal', state: 'TX', price: 10 },
    { id: 'L2', vertical: 'legal', state: 'TX', price: 10 },
    { id: 'L3', vertical: 'legal', state: 'CA', price: 20 },
  ];
  it('groups by dims and subtracts approved returns exactly once', () => {
    const lines = computeBillingLines(leads, [{ lead_id: 'L2' }], ['vertical', 'state']);
    const tx = lines.find((l) => l.state === 'TX');
    expect(tx.lead_count).toBe(2);
    expect(tx.returns).toBe(1);
    expect(tx.billable_leads).toBe(1);
    expect(tx.amount).toBe(10); // returned lead not billed
    const ca = lines.find((l) => l.state === 'CA');
    expect(ca.amount).toBe(20);
  });
});

describe('applyReturnAdjustment', () => {
  it('applies once then dedupes', () => {
    const seen = new Set();
    expect(applyReturnAdjustment(seen, 'r1').applied).toBe(true);
    expect(applyReturnAdjustment(seen, 'r1').duplicate).toBe(true);
  });
});
