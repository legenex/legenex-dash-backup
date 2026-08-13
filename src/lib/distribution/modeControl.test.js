import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { planExecution, isCanaryLead, shouldFallback, executeMode, validateModeTransition, buildModeAudit } from './modeControl.js';
import { deliverDirectPost } from './directPost.js';
import { makeInMemoryAttemptStore } from './deliveryStore.js';
import { ATTEMPT_STATUS } from './deliveryAttempt.js';

let server; let base;
beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    req.on('data', () => {}); req.on('end', () => {
      if (p === '/accept') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"result":"accepted","revenue":10}'); }
      if (p === '/reject') { res.writeHead(400); return res.end('{"result":"rejected"}'); }
      if (p === '/reset') { res.write('{"par'); return req.socket.destroy(); }
      res.writeHead(404); res.end('no');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

// nativeDeliver hits the real mock server and normalizes to a mode-control status.
function makeNativeDeliver(path) {
  return async (lead) => {
    const store = makeInMemoryAttemptStore();
    const r = await deliverDirectPost({
      destinationId: 'd1', targetUrl: path === 'refused' ? 'http://127.0.0.1:1/x' : `${base}${path}`,
      method: 'POST', encoding: 'json', idempotencyKey: `${lead.id}:d1`, leadId: lead.id, leadData: lead,
      responseMapping: { rejectRe: 'rejected' }, attemptNumber: 1, isPrimary: true,
    }, { store, nowMs: 0, testMode: true, fetchImpl: globalThis.fetch });
    let status = r.status;
    if (r.status === ATTEMPT_STATUS.ERROR) status = /refused|ECONNREFUSED/i.test(String(r.errorClass)) ? 'error_clean' : 'ambiguous';
    return { status, native: true };
  };
}

describe('planExecution + isCanaryLead', () => {
  it('legacy_only runs nothing native, legacy authoritative', () => {
    expect(planExecution('legacy_only', {})).toEqual({ native: 'none', legacy: 'authoritative' });
  });
  it('shadow traces only', () => {
    expect(planExecution('shadow', {})).toMatchObject({ native: 'shadow', legacy: 'authoritative' });
  });
  it('canary routes only allowlisted leads', () => {
    const allow = { supplierKeys: ['TESTKEY'], campaignIds: ['ctest'], sourceMarker: 'canary_src' };
    expect(isCanaryLead({ _supplier_key: 'TESTKEY' }, allow)).toBe(true);
    expect(isCanaryLead({ source: 'canary_src' }, allow)).toBe(true);
    expect(isCanaryLead({ _supplier_key: 'REAL' }, allow)).toBe(false);
  });
  it('new_only never runs legacy', () => {
    expect(planExecution('new_only', {})).toEqual({ native: 'deliver', legacy: 'off' });
  });
});

describe('executeMode against the mock destination (no double-send)', () => {
  const canaryAllowlist = { supplierKeys: ['TESTKEY'] };

  it('legacy_only: legacy delivers, native never runs', async () => {
    let legacy = 0;
    const out = await executeMode('legacy_only', { id: 'L1' }, { nativeDeliver: makeNativeDeliver('/accept'), legacyDeliver: async () => { legacy++; return { legacy: true }; } });
    expect(out.native).toBe(null);
    expect(legacy).toBe(1);
  });

  it('canary: canary lead delivers native and does NOT touch legacy', async () => {
    let legacy = 0;
    const out = await executeMode('canary', { id: 'L2', _supplier_key: 'TESTKEY' },
      { canaryAllowlist, nativeDeliver: makeNativeDeliver('/accept'), legacyDeliver: async () => { legacy++; } });
    expect(out.native.status).toBe('accepted');
    expect(legacy).toBe(0); // no double-send
  });

  it('canary: non-canary lead is untouched (legacy only, native never runs)', async () => {
    let legacy = 0; let nativeCalled = 0;
    const out = await executeMode('canary', { id: 'L3', _supplier_key: 'REALKEY' },
      { canaryAllowlist, nativeDeliver: async () => { nativeCalled++; return { status: 'accepted' }; }, legacyDeliver: async () => { legacy++; } });
    expect(nativeCalled).toBe(0);
    expect(legacy).toBe(1);
    expect(out.native).toBe(null);
  });

  it('fallback mode: native accepted -> NO legacy fallback (no double-send)', async () => {
    let legacy = 0;
    await executeMode('new_primary_with_legacy_fallback', { id: 'L4' },
      { nativeDeliver: makeNativeDeliver('/accept'), legacyDeliver: async () => { legacy++; } });
    expect(legacy).toBe(0);
  });

  it('fallback mode: native clean rejection -> legacy fallback runs once', async () => {
    let legacy = 0;
    await executeMode('new_primary_with_legacy_fallback', { id: 'L5' },
      { nativeDeliver: makeNativeDeliver('/reject'), legacyDeliver: async () => { legacy++; } });
    expect(legacy).toBe(1);
  });

  it('fallback mode: native AMBIGUOUS -> NO legacy fallback (cannot double-send)', async () => {
    let legacy = 0;
    const out = await executeMode('new_primary_with_legacy_fallback', { id: 'L6' },
      { nativeDeliver: makeNativeDeliver('/reset'), legacyDeliver: async () => { legacy++; } });
    expect(out.native.status).toBe('ambiguous');
    expect(legacy).toBe(0);
  });

  it('new_only: native delivers, legacy never runs', async () => {
    let legacy = 0;
    await executeMode('new_only', { id: 'L7' }, { nativeDeliver: makeNativeDeliver('/accept'), legacyDeliver: async () => { legacy++; } });
    expect(legacy).toBe(0);
  });
});

describe('mode transition validation + audit', () => {
  it('rejects unknown mode and no-op', () => {
    expect(validateModeTransition('legacy_only', 'bogus').valid).toBe(false);
    expect(validateModeTransition('shadow', 'shadow').valid).toBe(false);
    expect(validateModeTransition('legacy_only', 'shadow').valid).toBe(true);
  });
  it('builds an audit record with who/when/from/to/reason', () => {
    const a = buildModeAudit({ from: 'legacy_only', to: 'shadow', actorId: 'op1', reason: 'start shadow', nowMs: 0 });
    expect(a).toMatchObject({ action: 'mode_change', from_value: 'legacy_only', to_value: 'shadow', actor_id: 'op1', reason: 'start shadow' });
  });
});

describe('shouldFallback', () => {
  it('never falls back on accepted, duplicate, or ambiguous', () => {
    for (const s of ['accepted', 'duplicate', 'ambiguous']) expect(shouldFallback(s)).toBe(false);
  });
  it('falls back only on approved clean-failure categories', () => {
    expect(shouldFallback('rejected')).toBe(true);
    expect(shouldFallback('error_clean')).toBe(true);
    expect(shouldFallback('weird_status')).toBe(false);
  });
});
