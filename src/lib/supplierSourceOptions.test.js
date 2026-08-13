import { describe, it, expect } from 'vitest';
import {
  buildSupplierSourceOptions, optionValueForRule, optionValueForSupplierName,
  resolutionForOption, describeStoredPairing, SUPPLIER_ONLY,
  buildSupplierOptions, sourceOptionsForSid, supplierNameForSid,
} from '@/lib/supplierSourceOptions';

const SUPPLIERS = [
  { id: 's-lgnx', name: 'Legenex', sid: 'LGNX', active: true },
  { id: 's-lf', name: 'LeadFlow', sid: 'LEADFLOW', active: true },
  { id: 's-old', name: 'Retired', sid: 'OLD', active: false },
];

const SOURCES = [
  { id: 'src-1', supplier_id: 's-lgnx', source_code: 'CAC-CALLS', brand: 'Check A Case', active: true },
  { id: 'src-2', supplier_id: 's-lgnx', source_code: 'DS-CALLS', brand: 'Dont Settle', active: true },
  { id: 'src-3', supplier_id: 's-lf', source_code: 'CAC-LEADS', brand: 'Check A Case', active: true },
  { id: 'src-4', supplier_id: 's-lgnx', source_code: 'GONE', brand: '', active: false },
  { id: 'src-5', supplier_id: 'missing-supplier', source_code: 'ORPHAN', active: true },
];

describe('buildSupplierSourceOptions', () => {
  it('offers every active source, labelled with its supplier', () => {
    const { options } = buildSupplierSourceOptions(SUPPLIERS, SOURCES);
    const labels = options.map((o) => o.label);
    expect(labels.some((l) => l.startsWith('CAC-CALLS') && l.includes('Legenex') && l.includes('LGNX'))).toBe(true);
  });

  it('omits inactive sources and orphans with no supplier', () => {
    const { options } = buildSupplierSourceOptions(SUPPLIERS, SOURCES);
    expect(options.some((o) => o.label.includes('GONE'))).toBe(false);
    expect(options.some((o) => o.label.includes('ORPHAN'))).toBe(false);
  });

  it('omits inactive suppliers from the supplier-only entries', () => {
    const { options } = buildSupplierSourceOptions(SUPPLIERS, SOURCES);
    expect(options.some((o) => o.label.includes('Retired'))).toBe(false);
  });

  it('puts sources above the supplier-only fallbacks', () => {
    const { options } = buildSupplierSourceOptions(SUPPLIERS, SOURCES);
    const firstFallback = options.findIndex((o) => o.value.endsWith(SUPPLIER_ONLY));
    const lastSource = options.map((o) => o.value.endsWith(SUPPLIER_ONLY)).lastIndexOf(false);
    expect(lastSource).toBeLessThan(firstFallback);
  });

  it('carries the sid alongside every source so the pair cannot drift', () => {
    const { index } = buildSupplierSourceOptions(SUPPLIERS, SOURCES);
    expect(index.get('LGNX::CAC-CALLS')).toMatchObject({ sid: 'LGNX', ssid: 'CAC-CALLS', supplier_name: 'Legenex' });
    expect(index.get('LEADFLOW::CAC-LEADS')).toMatchObject({ sid: 'LEADFLOW', ssid: 'CAC-LEADS' });
  });

  it('handles empty inputs without throwing', () => {
    expect(buildSupplierSourceOptions().options).toEqual([]);
    expect(buildSupplierSourceOptions([], []).options).toEqual([]);
  });
});

describe('optionValueForRule', () => {
  const { index } = buildSupplierSourceOptions(SUPPLIERS, SOURCES);

  it('finds the option for a saved rule', () => {
    expect(optionValueForRule({ sid: 'LGNX', ssid: 'CAC-CALLS' }, index)).toBe('LGNX::CAC-CALLS');
  });

  it('finds the supplier-only option', () => {
    expect(optionValueForRule({ sid: 'LGNX', ssid: '' }, index)).toBe(`LGNX::${SUPPLIER_ONLY}`);
  });

  it('returns blank for a pairing no current source matches, rather than guessing', () => {
    expect(optionValueForRule({ sid: '', ssid: 'CAC-CALLS' }, index)).toBe('');
    expect(optionValueForRule({ sid: 'LGNX', ssid: 'TYPO-CALLS' }, index)).toBe('');
  });

  it('returns blank for an empty rule', () => {
    expect(optionValueForRule({}, index)).toBe('');
  });
});

describe('resolutionForOption', () => {
  const { index } = buildSupplierSourceOptions(SUPPLIERS, SOURCES);

  it('returns all three fields together', () => {
    expect(resolutionForOption('LGNX::DS-CALLS', index))
      .toEqual({ sid: 'LGNX', ssid: 'DS-CALLS', supplier_name: 'Legenex' });
  });

  it('clears every field for the blank choice', () => {
    expect(resolutionForOption('', index)).toEqual({ sid: '', ssid: '', supplier_name: '' });
  });

  it('leaves ssid empty for a supplier-only pick', () => {
    expect(resolutionForOption(`LEADFLOW::${SUPPLIER_ONLY}`, index))
      .toEqual({ sid: 'LEADFLOW', ssid: '', supplier_name: 'LeadFlow' });
  });
});

describe('buildSupplierOptions', () => {
  it('offers each active supplier by sid', () => {
    const opts = buildSupplierOptions(SUPPLIERS);
    expect(opts.map((o) => o.value)).toEqual(['LEADFLOW', 'LGNX']);
    expect(opts[1].label).toContain('Legenex');
  });

  it('omits inactive suppliers and any with no sid', () => {
    const opts = buildSupplierOptions([...SUPPLIERS, { id: 'x', name: 'No Sid', sid: '', active: true }]);
    expect(opts.some((o) => o.label.includes('Retired'))).toBe(false);
    expect(opts.some((o) => o.label.includes('No Sid'))).toBe(false);
  });
});

describe('sourceOptionsForSid', () => {
  it('returns only the sources belonging to that supplier', () => {
    const opts = sourceOptionsForSid('LGNX', SUPPLIERS, SOURCES);
    expect(opts.map((o) => o.value)).toEqual(['CAC-CALLS', 'DS-CALLS']);
  });

  it('never leaks another supplier source', () => {
    const opts = sourceOptionsForSid('LEADFLOW', SUPPLIERS, SOURCES);
    expect(opts.map((o) => o.value)).toEqual(['CAC-LEADS']);
  });

  it('omits inactive sources', () => {
    expect(sourceOptionsForSid('LGNX', SUPPLIERS, SOURCES).some((o) => o.value === 'GONE')).toBe(false);
  });

  it('returns nothing for a blank or unknown sid', () => {
    expect(sourceOptionsForSid('', SUPPLIERS, SOURCES)).toEqual([]);
    expect(sourceOptionsForSid('NOPE', SUPPLIERS, SOURCES)).toEqual([]);
  });

  it('matches the sid case-insensitively', () => {
    expect(sourceOptionsForSid('lgnx', SUPPLIERS, SOURCES)).toHaveLength(2);
  });
});

describe('supplierNameForSid', () => {
  it('resolves the name so a rule carries all three fields', () => {
    expect(supplierNameForSid('LGNX', SUPPLIERS)).toBe('Legenex');
  });

  it('returns blank for unknown or missing', () => {
    expect(supplierNameForSid('NOPE', SUPPLIERS)).toBe('');
    expect(supplierNameForSid('', SUPPLIERS)).toBe('');
  });
});

describe('optionValueForSupplierName', () => {
  const { index } = buildSupplierSourceOptions(SUPPLIERS, SOURCES);

  it('maps a legacy supplier-name pin onto that supplier, so editing does not drop it', () => {
    expect(optionValueForSupplierName('Legenex', index)).toBe(`LGNX::${SUPPLIER_ONLY}`);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(optionValueForSupplierName('  legenex ', index)).toBe(`LGNX::${SUPPLIER_ONLY}`);
  });

  it('never returns a source-level option, only the supplier-only one', () => {
    const v = optionValueForSupplierName('Legenex', index);
    expect(index.get(v).ssid).toBe('');
  });

  it('returns blank for an unknown or missing name', () => {
    expect(optionValueForSupplierName('Nobody', index)).toBe('');
    expect(optionValueForSupplierName('', index)).toBe('');
    expect(optionValueForSupplierName('Legenex', null)).toBe('');
  });
});

describe('describeStoredPairing', () => {
  it('describes an unrecognised pairing so it can be shown, not hidden', () => {
    expect(describeStoredPairing({ sid: 'LGNX', ssid: 'TYPO-CALLS', supplier_name: 'Legenex' }))
      .toBe('TYPO-CALLS · sid LGNX · Legenex');
  });

  it('copes with a partial pairing', () => {
    expect(describeStoredPairing({ ssid: 'CAC-CALLS' })).toBe('CAC-CALLS');
    expect(describeStoredPairing({})).toBe('');
  });
});
