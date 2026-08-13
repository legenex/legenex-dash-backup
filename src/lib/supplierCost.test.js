import { describe, it, expect } from 'vitest';
import {
  supplierCostMetrics,
  internalSupplierSpend,
  sameSupplier,
} from '@/lib/supplierCost';

// Cost and payout are different numbers and must never collapse into one.
//
//   Cost   = what acquiring the leads cost us.
//            Internal: mapped ad account spend. External: the leads' own cpl.
//   Payout = what the supplier is owed, per their payout type.
//            Flat CPL: the cpl they sent. Profit %: pct of window profit.

const day = (d) => new Date(`2026-07-${d}T12:00:00Z`);
const win = (from, to) => ({ start: day(from), end: day(to) });

const leadflow = { id: 'sup_lf', name: 'LeadFlow', supplier_type: 'Internal' };
const lfSource = { id: 'src_lf', supplier_id: 'sup_lf', pricing_model: 'profit_pct', profit_pct: 30, active: true };

// Revenue is carried on the leads; cost comes from ad spend.
const lfLeads = (count, revenueEach, dayNum) =>
  Array.from({ length: count }, (_, i) => ({
    id: `l${dayNum}_${i}`,
    supplier_name: 'LEADFLOW', // arrives uppercase from the inbound payload
    revenue: revenueEach,
    created_date: `2026-07-${dayNum}T10:00:00Z`,
  }));

const spend = (dayNum, amount) => ({
  ad_account_id: 'act_630657151370020',
  date: `2026-07-${dayNum}`,
  level: 'account',
  supplier_key: 'leadflow',
  spend: amount,
});

describe('supplier cost vs payout', () => {
  it("matches LEADFLOW payload casing to the LeadFlow record", () => {
    expect(sameSupplier('LEADFLOW', 'LeadFlow')).toBe(true);
    expect(sameSupplier('Leadflow', 'LEADFLOW')).toBe(true);
    expect(sameSupplier('LeadFlow', 'Legenex')).toBe(false);
  });

  it('owes 30% of profit on the full month: $80k revenue, $60k cost, $6k payout', () => {
    // 80 leads at $1000 = $80,000 revenue. $60,000 of ad spend.
    const leads = lfLeads(80, 1000, '10');
    const adSpend = [spend('10', 60000)];
    const m = supplierCostMetrics(leadflow, leads, { sup_lf: [lfSource] }, adSpend, win('01', '31'));

    expect(m.revenue).toBeCloseTo(80000, 2);
    expect(m.cost).toBeCloseTo(60000, 2);
    expect(m.profit).toBeCloseTo(20000, 2);
    expect(m.payout).toBeCloseTo(6000, 2); // 30% of 20k
    // The two must not be the same number.
    expect(m.payout).not.toBeCloseTo(m.cost, 2);
  });

  it('recomputes the payout for a narrower window: 1-15 July gives $4.5k', () => {
    // In-window: 45 leads at $1000 on the 10th, $30,000 spend.
    // Out-of-window: more revenue and spend on the 20th, must be excluded.
    const leads = [...lfLeads(45, 1000, '10'), ...lfLeads(35, 1000, '20')];
    const adSpend = [spend('10', 30000), spend('20', 30000)];
    const m = supplierCostMetrics(leadflow, leads, { sup_lf: [lfSource] }, adSpend, win('01', '15'));

    expect(m.revenue).toBeCloseTo(45000, 2);
    expect(m.cost).toBeCloseTo(30000, 2);
    expect(m.profit).toBeCloseTo(15000, 2);
    expect(m.payout).toBeCloseTo(4500, 2); // 30% of 15k
  });

  it('window-filters ad spend, so one day does not report the whole history', () => {
    const adSpend = [spend('10', 1000), spend('15', 2000), spend('20', 4000)];
    expect(internalSupplierSpend('LeadFlow', adSpend, win('15', '15'))).toBeCloseTo(2000, 2);
    expect(internalSupplierSpend('LeadFlow', adSpend, win('01', '31'))).toBeCloseTo(7000, 2);
  });

  it('reconstructs a missing account rollup from that day campaign rows', () => {
    const rows = [
      { ad_account_id: 'act_1', date: '2026-07-15', level: 'campaign', supplier_key: 'leadflow', spend: 1294.69 },
      { ad_account_id: 'act_1', date: '2026-07-15', level: 'campaign', supplier_key: 'leadflow', spend: 522.57 },
    ];
    expect(internalSupplierSpend('LeadFlow', rows, win('15', '15'))).toBeCloseTo(1817.26, 2);
  });

  it('for a flat-CPL external supplier, cost and payout coincide', () => {
    const acme = { id: 'sup_a', name: 'Acme', supplier_type: 'External' };
    const src = { id: 'src_a', supplier_id: 'sup_a', pricing_model: 'flat_cpl', flat_cpl: 250, active: true };
    const leads = [
      { id: 'a1', supplier_name: 'Acme', revenue: 400, created_date: '2026-07-10T10:00:00Z' },
      { id: 'a2', supplier_name: 'Acme', revenue: 400, created_date: '2026-07-10T10:00:00Z' },
    ];
    const m = supplierCostMetrics(acme, leads, { sup_a: [src] }, [], win('01', '31'));

    expect(m.cost).toBeCloseTo(500, 2);   // 2 x $250
    expect(m.payout).toBeCloseTo(500, 2); // flat CPL: what we pay is what they are owed
  });

  it('prices a revenue_pct source from its rate, not the reported payout', () => {
    // This is the branch that silently returned null while the code looked for
    // a pricing_model of 'rev_share', which does not exist in the schema.
    const inb = { id: 'sup_i', name: 'Inbounds', supplier_type: 'External' };
    const src = { id: 'src_i', supplier_id: 'sup_i', pricing_model: 'revenue_pct', revenue_pct: 70, active: true };
    const leads = [
      { id: 'i1', supplier_name: 'Inbounds', revenue: 1000, supplier_payout: 999, created_date: '2026-07-10T10:00:00Z' },
    ];
    const m = supplierCostMetrics(inb, leads, { sup_i: [src] }, [], win('01', '31'));

    expect(m.cost).toBeCloseTo(700, 2);   // 70% of 1000, not the 999 on the lead
    expect(m.payout).toBeCloseTo(700, 2);
  });
});
