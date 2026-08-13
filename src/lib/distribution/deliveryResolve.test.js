import { describe, it, expect } from 'vitest';
import { resolveSubDeliveryCfg, projectSubDeliveryForClient } from './deliveryResolve.js';

describe('resolveSubDeliveryCfg', () => {
  it('maps a SubDelivery record into a directPost cfg fragment', () => {
    const sd = {
      id: 'sd1', delivery_id: 'del1', target_url: 'https://b.example/api', method: 'POST', encoding: 'form',
      headers: JSON.stringify({ 'X-Env': 'prod' }), credential_ref: 'ref-1', timeout_ms: 5000,
      field_map: JSON.stringify([{ src: 'email', dest: 'Email' }]),
      response_mapping: JSON.stringify({ accepted: 'ok', rejected: 'no', revenue: 'price', buyer_lead_id: 'id' }),
      retry_policy: JSON.stringify({ maxAttempts: 3 }),
    };
    const cfg = resolveSubDeliveryCfg(sd);
    expect(cfg.targetUrl).toBe('https://b.example/api');
    expect(cfg.encoding).toBe('form');
    expect(cfg.credentialRef).toBe('ref-1');
    expect(cfg.responseMapping.acceptRe).toBe('ok');
    expect(cfg.responseMapping.revenuePath).toBe('price');
    expect(cfg.responseMapping.leadIdPath).toBe('id');
    expect(cfg.fieldMap).toEqual([{ src: 'email', dest: 'Email' }]);
    expect(cfg.timeoutMs).toBe(5000);
  });

  it('never carries a resolved secret value', () => {
    const cfg = resolveSubDeliveryCfg({ id: 'sd', delivery_id: 'd', target_url: 'x', credential_ref: 'ref-9' });
    expect(JSON.stringify(cfg)).not.toMatch(/secret|password|bearer|apikey|api_key/i);
  });
});

// CREDENTIAL HARD RULE: no credential value appears in any operator/portal response.
describe('projectSubDeliveryForClient (no secret ever reaches the browser)', () => {
  it('exposes credential presence + last-updated only, never a value or the ref', () => {
    const sd = {
      id: 'sd1', delivery_id: 'del1', name: 'Primary', active: true, target_url: 'https://b/api',
      credential_ref: 'secret-storage-ref-abc123', credential_updated_at: '2026-07-17T00:00:00Z',
      headers: JSON.stringify({ 'X-Env': 'prod' }),
    };
    const p = projectSubDeliveryForClient(sd);
    expect(p.credential_present).toBe(true);
    expect(p.credential_updated_at).toBe('2026-07-17T00:00:00Z');
    // The reference itself is not shipped, and no key value is present.
    expect(p).not.toHaveProperty('credential_ref');
    expect(JSON.stringify(p)).not.toContain('secret-storage-ref-abc123');
  });

  it('redacts a secret-named header even if one was mis-stored', () => {
    const sd = {
      id: 'sd1', delivery_id: 'del1', credential_ref: 'ref',
      headers: JSON.stringify({ Authorization: 'Bearer LEAKED-KEY', 'X-Api-Key': 'AK-LEAK', 'X-Env': 'prod' }),
    };
    const p = projectSubDeliveryForClient(sd);
    const s = JSON.stringify(p);
    expect(s).not.toContain('LEAKED-KEY');
    expect(s).not.toContain('AK-LEAK');
    expect(p.headers['X-Env']).toBe('prod');
  });

  it('reports credential absence when there is no reference', () => {
    const p = projectSubDeliveryForClient({ id: 'sd', delivery_id: 'd' });
    expect(p.credential_present).toBe(false);
    expect(p.credential_updated_at).toBe(null);
  });
});
