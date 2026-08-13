import { describe, it, expect } from 'vitest';
import { evaluateMember, REASON } from './engine.js';
import { evalConditionTree } from './conditions.js';

const base = {
  id: 'm1', active: true, priority: 1, price: 10,
  buyer: { active: true, status: 'active' },
};
const lead = { state: 'TX', zip: '78701', county: 'Travis', age: '40' };

describe('zip / county filters', () => {
  it('enforces zip filter', () => {
    const m = { ...base, filters: { zips: ['78701', '78702'] } };
    expect(evaluateMember(m, lead).eligible).toBe(true);
    expect(evaluateMember(m, { ...lead, zip: '90210' }).reason).toBe(REASON.FILTER_ZIP);
  });
  it('enforces county filter (case-insensitive)', () => {
    const m = { ...base, filters: { counties: ['travis'] } };
    expect(evaluateMember(m, lead).eligible).toBe(true);
    expect(evaluateMember(m, { ...lead, county: 'Harris' }).reason).toBe(REASON.FILTER_COUNTY);
  });
});

describe('qualification conditions via injected evaluator', () => {
  const evalConditions = (tree, data) => evalConditionTree(tree, data, { nowMs: 0 });
  it('passes when conditions are met', () => {
    const m = { ...base, conditions: { field: 'age', operator: 'gte', value: 18 } };
    expect(evaluateMember(m, lead, { evalConditions }).eligible).toBe(true);
  });
  it('fails with QUALIFICATION_FAILED when not met', () => {
    const m = { ...base, conditions: { field: 'age', operator: 'gte', value: 65 } };
    expect(evaluateMember(m, lead, { evalConditions }).reason).toBe(REASON.QUALIFICATION_FAILED);
  });
  it('ignores conditions when no evaluator is injected', () => {
    const m = { ...base, conditions: { field: 'age', operator: 'gte', value: 65 } };
    expect(evaluateMember(m, lead).eligible).toBe(true);
  });
});
