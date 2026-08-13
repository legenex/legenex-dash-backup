import { describe, it, expect } from 'vitest';
import { resolveCampaign, CAMPAIGN_MATCH } from './campaignResolve.js';

const MVA = { id: 'c-mva-record', campaign_id: 'MVA', name: 'MVA', vertical: 'MVA', status: 'active', active: true };
const WC = { id: 'c-wc-record', campaign_id: 'WC', name: 'WC', vertical: 'WC', status: 'active', active: true };
const OFF = { id: 'c-old', campaign_id: 'OLD', name: 'Old', vertical: 'MVA', status: 'disabled', active: false };
const ALL = [MVA, WC, OFF];

describe('resolveCampaign', () => {
  it('prefers the posted campaign code over everything else', () => {
    const r = resolveCampaign({ campaign_id: 'WC', vertical: 'MVA' }, ALL);
    expect(r.campaignId).toBe('c-wc-record');
    expect(r.matchedBy).toBe(CAMPAIGN_MATCH.BY_CODE);
  });

  it('matches the posted code case-insensitively and ignores surrounding space', () => {
    expect(resolveCampaign({ campaign_id: '  wc ' }, ALL).campaignId).toBe('c-wc-record');
  });

  it('accepts the internal record id as a campaign_id', () => {
    const r = resolveCampaign({ campaign_id: 'c-mva-record' }, ALL);
    expect(r.campaignId).toBe('c-mva-record');
    expect(r.matchedBy).toBe(CAMPAIGN_MATCH.BY_RECORD_ID);
  });

  it('falls back to the vertical when no campaign is posted', () => {
    const r = resolveCampaign({ vertical: 'MVA' }, ALL);
    expect(r.campaignId).toBe('c-mva-record');
    expect(r.matchedBy).toBe(CAMPAIGN_MATCH.BY_VERTICAL);
  });

  it('reads the vertical from lead_vertical when vertical is absent', () => {
    expect(resolveCampaign({ lead_vertical: 'wc' }, ALL).campaignId).toBe('c-wc-record');
  });

  it('never routes a lead to a disabled campaign', () => {
    expect(resolveCampaign({ campaign_id: 'OLD' }, ALL).campaign).toBe(null);
    // and the disabled MVA-vertical campaign is not used as a vertical fallback
    expect(resolveCampaign({ vertical: 'MVA' }, [OFF]).campaign).toBe(null);
  });

  it('fails closed on an unknown posted campaign instead of falling back to vertical', () => {
    // The supplier explicitly addressed a campaign. Quietly selling the lead into
    // a different one because the vertical happens to match would be wrong.
    const r = resolveCampaign({ campaign_id: 'NOPE', vertical: 'MVA' }, ALL);
    expect(r.campaign).toBe(null);
    expect(r.matchedBy).toBe(CAMPAIGN_MATCH.UNKNOWN_CODE);
    expect(r.reason).toMatch(/did not match/i);
  });

  it('returns a clear reason when the lead carries neither campaign nor vertical', () => {
    const r = resolveCampaign({}, ALL);
    expect(r.campaign).toBe(null);
    expect(r.matchedBy).toBe(CAMPAIGN_MATCH.NONE);
    expect(r.reason).toMatch(/no campaign_id and no vertical/i);
  });

  it('is safe with no campaigns configured at all', () => {
    expect(resolveCampaign({ vertical: 'MVA' }, []).campaign).toBe(null);
    expect(resolveCampaign({ vertical: 'MVA' }, null).campaign).toBe(null);
  });
});
