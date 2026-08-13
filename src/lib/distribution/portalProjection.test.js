import { describe, it, expect } from 'vitest';
import {
  projectLeadForBuyer, projectLeadForSupplier, authorizePortal, sanitizeApiKey, ownsLead,
} from './portalProjection.js';

const fullLead = {
  id: 'L1', lead_id: 42, first_name: 'Jo', last_name: 'Doe', state: 'TX', email: 'a@b.com',
  mobile: '5125550100', final_status: 'Sold', buyer_feedback: 'Converted', revenue: 25, cost: 8,
  raw_payload: '{"ssn":"..."}', mapped_fields: '{}', capi_log: '[]', delivery_log: '[]',
  supplier_key_id: 'key_123', buyer_api_key: 'secret', trustedform_url: 'https://cert...',
  supplier_name: 'AcmeSupplier', buyer_id: 'B1',
};

describe('portal authorization matrix (direct-call semantics)', () => {
  const buyerA = { id: 'uA', base_role: 'buyer', linked_buyer_id: 'BA' };
  const buyerB = { id: 'uB', base_role: 'buyer', linked_buyer_id: 'BB' };
  const supplierA = { id: 'sA', base_role: 'supplier', linked_supplier_id: 'SA' };
  const supplierB = { id: 'sB', base_role: 'supplier', linked_supplier_id: 'SB' };
  const unlinkedBuyer = { id: 'x', base_role: 'buyer' };
  const unlinkedSupplier = { id: 'y', base_role: 'supplier' };
  const operator = { id: 'op', role: 'admin' };

  it('buyer A is scoped to BA and cannot reach BB', () => {
    expect(authorizePortal({ user: buyerA, kind: 'buyer', portalEnabled: true })).toMatchObject({ allowed: true, scopeId: 'BA' });
    expect(authorizePortal({ user: buyerA, kind: 'buyer', requestedId: 'BB', portalEnabled: true }))
      .toMatchObject({ allowed: false, reason: 'cross_scope' });
  });
  it('buyer B is scoped to BB', () => {
    expect(authorizePortal({ user: buyerB, kind: 'buyer', portalEnabled: true }).scopeId).toBe('BB');
  });
  it('supplier A and B are scoped to their own supplier', () => {
    expect(authorizePortal({ user: supplierA, kind: 'supplier', portalEnabled: true }).scopeId).toBe('SA');
    expect(authorizePortal({ user: supplierB, kind: 'supplier', portalEnabled: true }).scopeId).toBe('SB');
  });
  it('unlinked buyer and supplier fail closed (403)', () => {
    expect(authorizePortal({ user: unlinkedBuyer, kind: 'buyer', portalEnabled: true })).toMatchObject({ allowed: false, status: 403 });
    expect(authorizePortal({ user: unlinkedSupplier, kind: 'supplier', portalEnabled: true })).toMatchObject({ allowed: false, status: 403 });
  });
  it('operator may preview a specific scope via explicit override', () => {
    expect(authorizePortal({ user: operator, kind: 'buyer', requestedId: 'BX', portalEnabled: true }))
      .toMatchObject({ allowed: true, scopeId: 'BX' });
  });
  it('unauthenticated caller is 401', () => {
    expect(authorizePortal({ user: null, kind: 'buyer' })).toMatchObject({ allowed: false, status: 401 });
  });
  it('a buyer account cannot use the supplier portal (wrong_portal)', () => {
    expect(authorizePortal({ user: buyerA, kind: 'supplier', portalEnabled: true })).toMatchObject({ allowed: false, reason: 'wrong_portal' });
  });
  it('portal-disabled denies non-admins', () => {
    expect(authorizePortal({ user: buyerA, kind: 'buyer', portalEnabled: false })).toMatchObject({ allowed: false, reason: 'portal_disabled' });
  });
});

describe('deny-by-default projections', () => {
  it('buyer projection: no raw payload, secrets, or supplier identity', () => {
    const out = projectLeadForBuyer(fullLead);
    expect(out).toHaveProperty('final_status', 'Sold');
    for (const k of ['raw_payload', 'supplier_key_id', 'delivery_log', 'supplier_name', 'buyer_api_key', 'cost']) {
      expect(Object.keys(out)).not.toContain(k);
    }
  });
  it('supplier projection: no revenue, cost, buyer identity, raw payload, or PII email', () => {
    const out = projectLeadForSupplier(fullLead);
    expect(out).toHaveProperty('final_status', 'Sold');
    for (const k of ['revenue', 'cost', 'buyer_id', 'raw_payload', 'email', 'buyer_api_key']) {
      expect(Object.keys(out)).not.toContain(k);
    }
  });
  it('sanitizeApiKey returns prefix + metadata, never the raw key', () => {
    const s = sanitizeApiKey({ key: 'SECRETKEY123456', key_prefix: 'SECRET', name: 'k', request_count: 3 });
    expect(s.key_prefix).toBe('SECRET');
    expect(JSON.stringify(s)).not.toContain('SECRETKEY123456');
    expect(s).not.toHaveProperty('key');
  });
  it('ownsLead gates cross-tenant writes', () => {
    expect(ownsLead({ buyer_id: 'BA' }, 'buyer_id', 'BA')).toBe(true);
    expect(ownsLead({ buyer_id: 'BB' }, 'buyer_id', 'BA')).toBe(false);
  });
});
