import { describe, it, expect } from 'vitest';
import { evalLeaf, evalConditionTree } from './conditions.js';

describe('evalLeaf operators + coercion', () => {
  const d = { state: 'TX', age: '34', email: 'a@b.com', accident_date: '2026-06-01' };
  it('equals/not_equals are case-insensitive', () => {
    expect(evalLeaf({ field: 'state', operator: 'equals', value: 'tx' }, d)).toBe(true);
    expect(evalLeaf({ field: 'state', operator: 'not_equals', value: 'ny' }, d)).toBe(true);
  });
  it('numeric comparisons coerce strings', () => {
    expect(evalLeaf({ field: 'age', operator: 'gte', value: 30 }, d)).toBe(true);
    expect(evalLeaf({ field: 'age', operator: 'lt', value: 30 }, d)).toBe(false);
    expect(evalLeaf({ field: 'age', operator: 'between', value: [18, 65] }, d)).toBe(true);
  });
  it('in / not_in accept arrays and comma lists', () => {
    expect(evalLeaf({ field: 'state', operator: 'in', value: 'TX,CA' }, d)).toBe(true);
    expect(evalLeaf({ field: 'state', operator: 'not_in', value: ['NY', 'FL'] }, d)).toBe(true);
  });
  it('contains / matches', () => {
    expect(evalLeaf({ field: 'email', operator: 'contains', value: '@b' }, d)).toBe(true);
    expect(evalLeaf({ field: 'email', operator: 'matches', value: '^[a-z]+@' }, d)).toBe(true);
    expect(evalLeaf({ field: 'email', operator: 'matches', value: '[' }, d)).toBe(false); // bad regex safe
  });
  it('exists / not_exists', () => {
    expect(evalLeaf({ field: 'email', operator: 'exists' }, d)).toBe(true);
    expect(evalLeaf({ field: 'nope', operator: 'not_exists' }, d)).toBe(true);
  });
  it('within_months uses ctx.nowMs', () => {
    const nowMs = Date.UTC(2026, 6, 1);
    expect(evalLeaf({ field: 'accident_date', operator: 'within_months', value: 3 }, d, { nowMs })).toBe(true);
    expect(evalLeaf({ field: 'accident_date', operator: 'within_months', value: 3 }, { accident_date: '2020-01-01' }, { nowMs })).toBe(false);
  });
});

describe('evalConditionTree and/or', () => {
  const d = { state: 'TX', age: '40' };
  it('AND requires all', () => {
    const tree = { op: 'and', children: [
      { field: 'state', operator: 'equals', value: 'TX' },
      { field: 'age', operator: 'gte', value: 18 },
    ] };
    expect(evalConditionTree(tree, d)).toBe(true);
  });
  it('OR requires any; nested trees work', () => {
    const tree = { op: 'or', children: [
      { field: 'state', operator: 'equals', value: 'NY' },
      { op: 'and', children: [{ field: 'age', operator: 'gt', value: 30 }] },
    ] };
    expect(evalConditionTree(tree, d)).toBe(true);
  });
  it('empty tree is unrestricted', () => {
    expect(evalConditionTree(null, d)).toBe(true);
    expect(evalConditionTree([], d)).toBe(true);
  });
  it('array is implicit AND', () => {
    expect(evalConditionTree([
      { field: 'state', operator: 'equals', value: 'TX' },
      { field: 'age', operator: 'lt', value: 10 },
    ], d)).toBe(false);
  });
});
