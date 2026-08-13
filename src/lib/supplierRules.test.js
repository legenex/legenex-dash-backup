import { describe, it, expect } from 'vitest';
import {
  parseSupplierRules, ruleMatches, resolveSupplier, applySupplierResolution,
  ruleOperatorNeedsValue, emptySupplierRule,
} from '@/lib/supplierRules';

const CAC = {
  field: 'publisher', operator: 'contains', value: 'CHECK-A-CASE',
  sid: 'CAC', ssid: 'CAC-MVA', supplier_name: 'Check a Case',
};
const CLAIM = {
  field: 'publisher', operator: 'contains', value: 'Claim Checker',
  sid: 'CC', ssid: 'CC', supplier_name: 'Claim Checker',
};

describe('parseSupplierRules', () => {
  it('parses a JSON string', () => {
    expect(parseSupplierRules(JSON.stringify([CAC]))).toHaveLength(1);
  });

  it('accepts an array as-is', () => {
    expect(parseSupplierRules([CAC, CLAIM])).toHaveLength(2);
  });

  it('degrades to no rules on unparseable input rather than throwing', () => {
    expect(parseSupplierRules('{not json')).toEqual([]);
    expect(parseSupplierRules(null)).toEqual([]);
    expect(parseSupplierRules('{"a":1}')).toEqual([]);
  });

  it('drops non-object entries', () => {
    expect(parseSupplierRules([CAC, null, 'x', 5])).toHaveLength(1);
  });
});

describe('ruleMatches', () => {
  it('matches case-insensitively', () => {
    expect(ruleMatches({ publisher: 'check-a-case-mva' }, CAC)).toBe(true);
    expect(ruleMatches({ publisher: 'CHECK-A-CASE-MVA' }, CAC)).toBe(true);
  });

  it('reads a field through casing and separator differences', () => {
    const rule = { field: 'publisherSubId', operator: 'equals', value: 'CAC-MVA' };
    expect(ruleMatches({ publisherSubId: 'CAC-MVA' }, rule)).toBe(true);
    expect(ruleMatches({ 'Publisher Sub Id': 'CAC-MVA' }, rule)).toBe(true);
    expect(ruleMatches({ publisher_sub_id: 'CAC-MVA' }, rule)).toBe(true);
  });

  it('supports each operator', () => {
    const rec = { publisher: 'CHECK-A-CASE-MVA' };
    expect(ruleMatches(rec, { field: 'publisher', operator: 'equals', value: 'CHECK-A-CASE-MVA' })).toBe(true);
    expect(ruleMatches(rec, { field: 'publisher', operator: 'equals', value: 'CHECK-A-CASE' })).toBe(false);
    expect(ruleMatches(rec, { field: 'publisher', operator: 'starts_with', value: 'check' })).toBe(true);
    expect(ruleMatches(rec, { field: 'publisher', operator: 'ends_with', value: 'MVA' })).toBe(true);
    expect(ruleMatches(rec, { field: 'publisher', operator: 'not_contains', value: 'walker' })).toBe(true);
    expect(ruleMatches({ publisher: '' }, { field: 'publisher', operator: 'is_empty' })).toBe(true);
    expect(ruleMatches(rec, { field: 'publisher', operator: 'is_not_empty' })).toBe(true);
  });

  it('never matches a rule with no field', () => {
    expect(ruleMatches({ publisher: 'x' }, { operator: 'is_not_empty' })).toBe(false);
  });

  it('treats an empty target as no match for text operators', () => {
    expect(ruleMatches({ publisher: 'anything' }, { field: 'publisher', operator: 'contains', value: '' })).toBe(false);
  });

  it('rejects an unknown operator rather than matching everything', () => {
    expect(ruleMatches({ publisher: 'x' }, { field: 'publisher', operator: 'regex', value: 'x' })).toBe(false);
  });
});

describe('resolveSupplier', () => {
  it('returns the first matching rule, so order is priority', () => {
    const narrow = { ...CAC, value: 'CHECK-A-CASE-MVA', ssid: 'CAC-MVA-EXACT' };
    const broad = { ...CAC, ssid: 'CAC-ANY' };
    const r = resolveSupplier({ publisher: 'CHECK-A-CASE-MVA' }, [narrow, broad]);
    expect(r.matched).toBe(true);
    expect(r.rule_index).toBe(0);
    expect(r.ssid).toBe('CAC-MVA-EXACT');
  });

  it('picks the right rule out of several', () => {
    const r = resolveSupplier({ publisher: 'Claim Checker' }, [CAC, CLAIM]);
    expect(r.sid).toBe('CC');
    expect(r.supplier_name).toBe('Claim Checker');
  });

  it('leaves the call unattributed when nothing matches', () => {
    const r = resolveSupplier({ publisher: 'Some Other Network' }, [CAC, CLAIM]);
    expect(r).toEqual({ matched: false, rule_index: -1, sid: '', ssid: '', supplier_name: '' });
  });

  it('treats a matching rule that sets nothing as a deliberate match', () => {
    const ignore = { field: 'publisher', operator: 'contains', value: 'test', sid: '', ssid: '', supplier_name: '' };
    const r = resolveSupplier({ publisher: 'TEST-TRAFFIC' }, [ignore, CAC]);
    expect(r.matched).toBe(true);
    expect(r.sid).toBe('');
  });

  it('returns unattributed when there are no rules at all', () => {
    expect(resolveSupplier({ publisher: 'CHECK-A-CASE' }, null).matched).toBe(false);
  });
});

describe('applySupplierResolution', () => {
  it('fills only what is missing', () => {
    const patch = applySupplierResolution(
      { sid: 'EXISTING', ssid: '', supplier_name: '' },
      { sid: 'CAC', ssid: 'CAC-MVA', supplier_name: 'Check a Case' },
    );
    expect(patch).toEqual({ ssid: 'CAC-MVA', supplier_name: 'Check a Case' });
  });

  it('never overwrites a value the row already carries', () => {
    const patch = applySupplierResolution(
      { sid: 'ROW', ssid: 'ROWSUB', supplier_name: 'Row Supplier' },
      { sid: 'CAC', ssid: 'CAC-MVA', supplier_name: 'Check a Case' },
    );
    expect(patch).toEqual({});
  });

  it('treats whitespace as missing', () => {
    const patch = applySupplierResolution({ sid: '   ' }, { sid: 'CAC', ssid: '', supplier_name: '' });
    expect(patch).toEqual({ sid: 'CAC' });
  });
});

describe('editor helpers', () => {
  it('knows which operators take no value', () => {
    expect(ruleOperatorNeedsValue('contains')).toBe(true);
    expect(ruleOperatorNeedsValue('is_empty')).toBe(false);
    expect(ruleOperatorNeedsValue('is_not_empty')).toBe(false);
  });

  it('produces a blank rule that matches nothing until filled in', () => {
    const blank = emptySupplierRule();
    expect(ruleMatches({ publisher: 'CHECK-A-CASE' }, blank)).toBe(false);
  });
});
