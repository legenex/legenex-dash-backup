import { describe, it, expect } from 'vitest';
import {
  normEmail, normMobile, partitionImport, findDuplicateGroups,
} from '@/lib/leadDedupe';

// A double-run CSV import on 19 July wrote 40+ leads twice and inflated every
// Sold count in the app. These pin the rule that prevents it.

describe('normalisation', () => {
  it('matches emails regardless of case and padding', () => {
    expect(normEmail('  Nick@Legenex.COM ')).toBe('nick@legenex.com');
  });

  it('matches mobiles across formatting and the US country code', () => {
    expect(normMobile('+1 (555) 867-5309')).toBe('5558675309');
    expect(normMobile('555.867.5309')).toBe('5558675309');
    expect(normMobile('15558675309')).toBe('5558675309');
  });

  it('ignores values too short to identify anyone', () => {
    expect(normMobile('123')).toBeNull();
    expect(normEmail('')).toBeNull();
  });
});

describe('partitionImport', () => {
  const existing = [
    { id: 'a', email: 'sold@example.com', mobile: '5551110000' },
    { id: 'b', email: 'other@example.com', mobile: '5552220000' },
  ];

  it('separates new leads from ones already stored', () => {
    const incoming = [
      { email: 'fresh@example.com', mobile: '5559990000' },
      { email: 'SOLD@example.com', mobile: '' },
    ];
    const { fresh, existingDupes } = partitionImport(incoming, existing);
    expect(fresh).toHaveLength(1);
    expect(existingDupes).toHaveLength(1);
    expect(existingDupes[0].existing.id).toBe('a');
  });

  it('catches a duplicate by mobile even when the email differs', () => {
    const incoming = [{ email: 'typo@example.com', mobile: '+1 555-111-0000' }];
    const { fresh, existingDupes } = partitionImport(incoming, existing);
    expect(fresh).toHaveLength(0);
    expect(existingDupes[0].existing.id).toBe('a');
  });

  it('catches rows repeated inside one file', () => {
    const incoming = [
      { email: 'new@example.com', mobile: '5553330000' },
      { email: 'new@example.com', mobile: '5554440000' },
    ];
    const { fresh, intraFileDupes } = partitionImport(incoming, []);
    expect(fresh).toHaveLength(1);
    expect(intraFileDupes).toHaveLength(1);
  });

  it('re-running the same file imports nothing the second time', () => {
    // Exactly the 19 July failure: the same export applied twice.
    const file = [
      { email: 'one@example.com', mobile: '5551230000' },
      { email: 'two@example.com', mobile: '5554560000' },
    ];
    const first = partitionImport(file, []);
    expect(first.fresh).toHaveLength(2);

    const stored = first.fresh.map((r, i) => ({ id: `s${i}`, ...r }));
    const second = partitionImport(file, stored);
    expect(second.fresh).toHaveLength(0);
    expect(second.existingDupes).toHaveLength(2);
  });

  it('does not treat rows with no email and no usable mobile as duplicates', () => {
    const incoming = [{ email: '', mobile: '' }, { email: '', mobile: '' }];
    const { fresh, existingDupes, intraFileDupes } = partitionImport(incoming, existing);
    expect(fresh).toHaveLength(2);
    expect(existingDupes).toHaveLength(0);
    expect(intraFileDupes).toHaveLength(0);
  });
});

describe('findDuplicateGroups', () => {
  it('groups stored duplicates and keeps the oldest', () => {
    const leads = [
      { id: 'new', email: 'dup@example.com', created_date: '2026-07-19T19:32:00' },
      { id: 'old', email: 'dup@example.com', created_date: '2026-07-19T19:31:00' },
      { id: 'solo', email: 'unique@example.com', created_date: '2026-07-19T19:31:00' },
    ];
    const groups = findDuplicateGroups(leads);
    expect(groups).toHaveLength(1);
    expect(groups[0].keep.id).toBe('old');
    expect(groups[0].remove.map(r => r.id)).toEqual(['new']);
  });

  it('returns nothing when every lead is unique', () => {
    expect(findDuplicateGroups([{ id: '1', email: 'a@b.com' }, { id: '2', email: 'c@d.com' }])).toEqual([]);
  });
});
