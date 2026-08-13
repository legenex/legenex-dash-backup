/* global process */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The supplier portal projection is a deny-by-default surface. A supplier may see
// the buyer CODE (so they can reference a specific sale when disputing or
// reconciling) but never the buyer NAME, which would let them approach our client
// directly.
//
// This is a static guard rather than a runtime test because the projection lives
// in a Deno backend function. It is deliberately blunt: if someone adds
// buyer_name to the supplier payload, this fails.
const ENTRY = path.join(process.cwd(), 'base44/functions/supplierPortalData/entry.ts');

function safeLeadsBlock(src) {
  const start = src.indexOf('const safeLeads');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('}));', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('supplier portal never exposes buyer identity', () => {
  const src = fs.readFileSync(ENTRY, 'utf8');
  const block = safeLeadsBlock(src);

  it('exposes the buyer code so a supplier can reference a specific sale', () => {
    expect(block).toContain('buyer_id');
  });

  it('never exposes the buyer name', () => {
    expect(block).not.toContain('buyer_name');
    expect(block).not.toContain('company_name');
  });

  it('never exposes revenue, cost or internal traces on the lead', () => {
    for (const banned of ['revenue', 'supplier_payout', 'raw_payload', 'mapped_fields', 'delivery_log', 'capi_log']) {
      expect(block).not.toContain(banned);
    }
  });
});