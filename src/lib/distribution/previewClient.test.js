import { describe, it, expect } from 'vitest';
import { buildDeliveryPreview, classifySampleResponse } from './previewClient.js';

const sub = {
  id: 'sd1', delivery_id: 'del1', target_url: 'https://buyer.example/api', method: 'POST', encoding: 'json',
  field_map: JSON.stringify([{ src: 'email', dest: 'Email' }, { src: 'mobile', dest: 'Phone', transform: 'phone_us' }]),
  response_mapping: JSON.stringify({ accepted: 'accepted', rejected: 'rejected', duplicate: 'dup', revenue: 'price', buyer_lead_id: 'id' }),
  credential_ref: 'ref-1',
};

describe('buildDeliveryPreview (dry-run, credentials masked)', () => {
  it('renders the exact outbound body from a sample lead', () => {
    const p = buildDeliveryPreview(sub, { email: 'a@b.com', mobile: '5551234567' });
    expect(p.url).toBe('https://buyer.example/api');
    expect(p.body).toContain('"Email": "a@b.com"');
    expect(p.body).toContain('Phone');
  });
  it('masks the credential and never shows a value', () => {
    const p = buildDeliveryPreview(sub, { email: 'a@b.com' });
    expect(p.headers.Authorization).toBe('[resolved server-side at send time]');
    expect(JSON.stringify(p)).not.toMatch(/ref-1/);
  });
});

describe('classifySampleResponse (dry-run)', () => {
  it('classifies an accepted response and extracts revenue + buyer lead id', () => {
    const r = classifySampleResponse(sub, { httpStatus: 200, body: JSON.stringify({ accepted: true, price: 42, id: 'B-9' }) });
    expect(r.status).toBe('accepted');
    expect(r.revenue).toBe(42);
    expect(r.buyerLeadId).toBe('B-9');
  });
  it('classifies a rejected response', () => {
    const r = classifySampleResponse(sub, { httpStatus: 200, body: JSON.stringify({ rejected: 'dq' }) });
    expect(r.status).toBe('rejected');
    expect(r.revenue).toBe(0);
  });
});
