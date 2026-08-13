import { describe, it, expect } from 'vitest';
import {
  passesFilters, matchesOutboundFilter, buildPayload, readRecordField,
  fillTemplate, parseFilters, safeParseObject,
} from '@/lib/outboundPayload';

const LEAD = {
  id: 'l1',
  email: 'a@b.com',
  first_name: 'Ada',
  final_status: 'Sold',
  revenue: 250,
  sid: 'LGNX',
  custom_fields: JSON.stringify({ law_type: 'MVA', 'Incident State': 'TX' }),
};

describe('readRecordField', () => {
  it('reads a top-level field', () => {
    expect(readRecordField(LEAD, 'email')).toBe('a@b.com');
  });

  it('falls back to the custom_fields bag', () => {
    expect(readRecordField(LEAD, 'law_type')).toBe('MVA');
  });

  it('matches loosely across casing and separators', () => {
    expect(readRecordField(LEAD, 'incident_state')).toBe('TX');
    expect(readRecordField(LEAD, 'firstName')).toBe('Ada');
  });

  it('returns undefined for an unknown field', () => {
    expect(readRecordField(LEAD, 'nope')).toBeUndefined();
  });
});

describe('filters', () => {
  it('fires on every trigger when there are no filters', () => {
    expect(passesFilters(LEAD, '[]')).toBe(true);
    expect(passesFilters(LEAD, null)).toBe(true);
  });

  it('requires every filter to pass', () => {
    const both = JSON.stringify([
      { field: 'final_status', operator: 'equals', value: 'Sold' },
      { field: 'sid', operator: 'equals', value: 'LGNX' },
    ]);
    expect(passesFilters(LEAD, both)).toBe(true);

    const oneFails = JSON.stringify([
      { field: 'final_status', operator: 'equals', value: 'Sold' },
      { field: 'sid', operator: 'equals', value: 'TFISH' },
    ]);
    expect(passesFilters(LEAD, oneFails)).toBe(false);
  });

  it('filters on a custom field', () => {
    expect(passesFilters(LEAD, JSON.stringify([{ field: 'law_type', operator: 'equals', value: 'MVA' }]))).toBe(true);
  });

  it('supports numeric comparison', () => {
    expect(matchesOutboundFilter(LEAD, { field: 'revenue', operator: 'gt', value: '100' })).toBe(true);
    expect(matchesOutboundFilter(LEAD, { field: 'revenue', operator: 'lt', value: '100' })).toBe(false);
  });

  it('degrades to no filters on unparseable JSON rather than throwing', () => {
    expect(parseFilters('{broken')).toEqual([]);
    expect(passesFilters(LEAD, '{broken')).toBe(true);
  });

  it('rejects an unknown operator rather than passing everything', () => {
    expect(matchesOutboundFilter(LEAD, { field: 'sid', operator: 'regex', value: 'LGNX' })).toBe(false);
  });
});

describe('buildPayload, builder mode', () => {
  const wh = {
    payload_mode: 'builder',
    payload_fields: JSON.stringify([
      { key: 'Email', source: 'field', value: 'email' },
      { key: 'Vertical', source: 'custom_field', value: 'law_type' },
      { key: 'Source', source: 'static', value: 'legenex' },
      { key: 'Missing', source: 'field', value: 'does_not_exist' },
    ]),
  };

  it('maps our fields onto the receiver keys', () => {
    const { ok, body } = buildPayload(wh, LEAD);
    expect(ok).toBe(true);
    expect(body.Email).toBe('a@b.com');
    expect(body.Vertical).toBe('MVA');
    expect(body.Source).toBe('legenex');
  });

  it('omits a key with no value rather than sending null, so the receiver does not clear good data', () => {
    const { body } = buildPayload(wh, LEAD);
    expect('Missing' in body).toBe(false);
  });

  it('always sends a static value even when the record is empty', () => {
    const { body } = buildPayload(wh, {});
    expect(body.Source).toBe('legenex');
  });

  it('skips rows with no key', () => {
    const { body } = buildPayload({ payload_fields: JSON.stringify([{ key: '  ', source: 'static', value: 'x' }]) }, LEAD);
    expect(Object.keys(body)).toHaveLength(0);
  });
});

describe('buildPayload, template mode', () => {
  it('substitutes placeholders and parses', () => {
    const wh = { payload_mode: 'template', payload_template: '{"e":"{{email}}","s":"{{final_status}}"}' };
    const { ok, body } = buildPayload(wh, LEAD);
    expect(ok).toBe(true);
    expect(body).toEqual({ e: 'a@b.com', s: 'Sold' });
  });

  it('reports invalid JSON instead of sending a broken body', () => {
    const wh = { payload_mode: 'template', payload_template: '{"e": {{email}} }' };
    const { ok, error } = buildPayload(wh, LEAD);
    expect(ok).toBe(false);
    expect(error).toMatch(/not valid JSON/i);
  });

  it('resolves an unknown placeholder to empty rather than leaving it literal', () => {
    expect(fillTemplate('{{nope}}', LEAD)).toBe('');
  });
});

describe('safeParseObject', () => {
  it('parses an object and rejects arrays and rubbish', () => {
    expect(safeParseObject('{"a":1}')).toEqual({ a: 1 });
    expect(safeParseObject('[1,2]')).toEqual({});
    expect(safeParseObject('nope')).toEqual({});
    expect(safeParseObject(null)).toEqual({});
  });
});
