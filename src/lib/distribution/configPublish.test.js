import { describe, it, expect } from 'vitest';
import { validateConfigForPublish, computeConfigHash, diffConfig, resolveTraceVersion, buildVersionSnapshot } from './configPublish.js';

const group = { id: 'g1', campaign_id: 'c1', method: 'priority', order_index: 0 };
const member = { id: 'm1', route_group_id: 'g1', buyer_id: 'b1', destination_id: 'd1', active: true, priority: 1, price_mode: 'fixed', fixed_price: 10 };
const buyer = { id: 'b1', status: 'active', active: true };
const dest = { id: 'd1' };

describe('validateConfigForPublish (fail closed)', () => {
  it('passes a complete valid config', () => {
    const r = validateConfigForPublish({ group, members: [member], buyers: [buyer], destinations: [dest] }, 0);
    expect(r.valid).toBe(true);
    expect(r.configHash).toBeTruthy();
  });
  it('fails when the group has no members', () => {
    expect(validateConfigForPublish({ group, members: [], buyers: [buyer], destinations: [dest] }, 0).valid).toBe(false);
  });
  it('fails when the buyer is missing or ineligible', () => {
    expect(validateConfigForPublish({ group, members: [member], buyers: [], destinations: [dest] }, 0).valid).toBe(false);
    const r = validateConfigForPublish({ group, members: [member], buyers: [{ id: 'b1', status: 'paused', active: true }], destinations: [dest] }, 0);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'BUYER_INELIGIBLE')).toBe(true);
  });
  it('fails when the destination is missing', () => {
    expect(validateConfigForPublish({ group, members: [member], buyers: [buyer], destinations: [] }, 0).valid).toBe(false);
  });
  it('fails on invalid caps json and invalid price', () => {
    expect(validateConfigForPublish({ group, members: [{ ...member, caps: '{bad' }], buyers: [buyer], destinations: [dest] }, 0).valid).toBe(false);
    expect(validateConfigForPublish({ group, members: [{ ...member, fixed_price: -5 }], buyers: [buyer], destinations: [dest] }, 0).valid).toBe(false);
  });
});

describe('validateConfigForPublish (canonical sub-delivery, fail closed)', () => {
  const delivery = { id: 'del1', buyer_id: 'b1', status: 'active' };
  const sub = { id: 'sd1', delivery_id: 'del1', active: true, target_url: 'https://buyer.example/api', response_mapping: '{"accepted":"ok"}' };
  const subMember = { ...member, destination_id: undefined, sub_delivery_id: 'sd1' };
  const base = (over = {}) => validateConfigForPublish({
    group, members: [subMember], buyers: [buyer], destinations: [],
    deliveries: [delivery], subDeliveries: [sub], ...over,
  }, 0);

  it('passes when the sub-delivery exists, is active, same buyer, has url + response mapping', () => {
    expect(base().valid).toBe(true);
  });
  it('fails when the sub-delivery does not exist', () => {
    expect(base({ subDeliveries: [] }).valid).toBe(false);
  });
  it('fails when the sub-delivery is inactive', () => {
    expect(base({ subDeliveries: [{ ...sub, active: false }] }).valid).toBe(false);
  });
  it('fails when the parent delivery belongs to a different buyer', () => {
    const r = base({ deliveries: [{ ...delivery, buyer_id: 'OTHER' }] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /different buyer|cross-buyer/i.test(e.detail))).toBe(true);
  });
  it('fails when the parent delivery is archived', () => {
    expect(base({ deliveries: [{ ...delivery, status: 'archived' }] }).valid).toBe(false);
  });
  it('fails when the sub-delivery has no target_url', () => {
    expect(base({ subDeliveries: [{ ...sub, target_url: '' }] }).valid).toBe(false);
  });
  it('fails when the sub-delivery has no response mapping', () => {
    expect(base({ subDeliveries: [{ ...sub, response_mapping: '' }] }).valid).toBe(false);
  });
});

describe('computeConfigHash + diff + version resolution', () => {
  it('hash is stable and changes when config changes', () => {
    const h1 = computeConfigHash(group, [member]);
    expect(computeConfigHash(group, [member])).toBe(h1);
    expect(computeConfigHash(group, [{ ...member, fixed_price: 99 }])).not.toBe(h1);
  });
  it('diff reports group and member changes', () => {
    const changes = diffConfig(
      { group, members: [member] },
      { group: { ...group, method: 'auction' }, members: [{ ...member, fixed_price: 20 }, { id: 'm2' }] },
    );
    expect(changes.find((c) => c.field === 'method')).toBeTruthy();
    expect(changes.find((c) => c.scope === 'member' && c.field === 'fixed_price')).toBeTruthy();
    expect(changes.find((c) => c.change === 'added')).toBeTruthy();
  });
  it('a historical trace resolves to its exact published version by config hash', () => {
    const hash = computeConfigHash(group, [member]);
    const versions = [
      { id: 'v1', config_hash: 'oldhash', snapshot: '{}' },
      { id: 'v2', config_hash: hash, snapshot: buildVersionSnapshot(group, [member]) },
    ];
    const trace = { lead_id: 'L1', config_version: hash };
    const resolved = resolveTraceVersion(trace.config_version, versions);
    expect(resolved.id).toBe('v2');
    expect(JSON.parse(resolved.snapshot).members[0].id).toBe('m1');
  });
});
