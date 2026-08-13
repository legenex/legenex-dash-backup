import { describe, it, expect } from 'vitest';
import { maskText, blockOut, viewportFor } from './mask';

// Masking is the only thing between the snapshot store and a pile of real lead
// personal data, so it is tested rather than trusted.
describe('personal data masking', () => {
  it('redacts email addresses', () => {
    const { text, hits } = maskText('Contact nick@legenex.com about this');
    expect(hits).toBe(1);
    expect(text).not.toContain('nick@legenex.com');
    expect(text.startsWith('Contact ')).toBe(true);
  });

  it('redacts phone numbers in the shapes the app renders', () => {
    ['(555) 123-4567', '555-123-4567', '+1 555 123 4567', '5551234567'].forEach((phone) => {
      const { text, hits } = maskText(`Lead phone ${phone}`);
      expect(hits).toBeGreaterThan(0);
      expect(text).not.toContain(phone);
    });
  });

  it('redacts TrustedForm certificate urls including the host', () => {
    const url = 'https://cert.trustedform.com/abc123def456ghi789jkl012';
    const { text, hits } = maskText(`cert ${url}`);
    expect(hits).toBeGreaterThan(0);
    expect(text).not.toContain('trustedform.com');
  });

  it('redacts long opaque tokens such as api keys and Jornaya ids', () => {
    const token = 'sk_live_A1b2C3d4E5f6G7h8I9j0K1l2';
    const { text, hits } = maskText(`key ${token}`);
    expect(hits).toBeGreaterThan(0);
    expect(text).not.toContain(token);
  });

  it('preserves length so the captured layout is unchanged', () => {
    const source = 'nick@legenex.com';
    const { text } = maskText(source);
    expect(text).toHaveLength(source.length);
    expect(/^\u2022+$/.test(text)).toBe(true);
  });

  it('leaves ordinary copy alone', () => {
    const { text, hits } = maskText('Sold leads for Motor Vehicle Accidents');
    expect(hits).toBe(0);
    expect(text).toBe('Sold leads for Motor Vehicle Accidents');
  });

  it('does not redact short identifiers that are not personal', () => {
    expect(maskText('MVA').hits).toBe(0);
    expect(maskText('Campaign WC active').hits).toBe(0);
  });

  it('handles empty and null input without throwing', () => {
    expect(maskText('').hits).toBe(0);
    expect(maskText(null).hits).toBe(0);
    expect(maskText(undefined).hits).toBe(0);
  });

  it('blocks out every non-space character', () => {
    expect(blockOut('ab cd')).toBe('\u2022\u2022 \u2022\u2022');
  });
});

describe('viewport bucketing', () => {
  it('buckets by real width rather than by assertion', () => {
    expect(viewportFor(1920)).toBe('desktop');
    expect(viewportFor(1440)).toBe('desktop');
    expect(viewportFor(768)).toBe('tablet');
    expect(viewportFor(390)).toBe('mobile');
    expect(viewportFor(0)).toBe('mobile');
  });
});
