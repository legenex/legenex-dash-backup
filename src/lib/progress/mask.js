// Personal data redaction for screenshots.
//
// Deliberately dependency free. This is the only thing standing between the
// snapshot store and a pile of real lead names, emails, phone numbers and
// certificate tokens, so it has to be unit testable without a browser or the
// Base44 client.
//
// Redaction preserves the length of what it replaces, so the page layout in the
// capture is unchanged and the shape of the data is still obvious.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// North American numbers in the shapes this app actually renders.
const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
// Long opaque tokens: TrustedForm and Jornaya identifiers, API keys, JWTs.
const TOKEN = /\b[A-Za-z0-9_-]{24,}\b/g;
const CERT_URL = /https?:\/\/cert\.trustedform\.com\/\S+/gi;

export const blockOut = (text) => (text || '').replace(/\S/g, '\u2022');

export function maskText(value) {
  if (!value) return { text: value, hits: 0 };
  let hits = 0;
  let out = value;
  const apply = (re) => {
    out = out.replace(re, (m) => { hits += 1; return blockOut(m); });
  };
  // Certificate urls first: they contain a token that would otherwise be
  // redacted on its own and leave the host visible.
  apply(CERT_URL);
  apply(EMAIL);
  apply(PHONE);
  apply(TOKEN);
  return { text: out, hits };
}

// Elements whose text is treated as personal regardless of its shape.
export const PII_SELECTORS = [
  '[data-pii]',
  '[data-progress-mask]',
  '[data-field="first_name"]',
  '[data-field="last_name"]',
  '[data-field="email"]',
  '[data-field="phone"]',
  '[data-field="address"]',
  '[data-field="ip_address"]',
];

export const VIEWPORTS = [
  { key: 'desktop', label: 'Desktop', min: 1100 },
  { key: 'tablet', label: 'Tablet', min: 700 },
  { key: 'mobile', label: 'Mobile', min: 0 },
];

// Viewport is DERIVED from a real width, never asserted.
export function viewportFor(width) {
  return VIEWPORTS.find((v) => width >= v.min)?.key || 'mobile';
}
