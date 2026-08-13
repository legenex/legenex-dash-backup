import html2canvas from 'html2canvas';
import { base44 } from '@/api/base44Client';
import manifest from '@/lib/progress/pageManifest.json';
import { maskText, blockOut, PII_SELECTORS, VIEWPORTS, viewportFor } from './mask';

// Screenshot capture for the Progress Control Center.
//
// The live app sends x-frame-options: DENY, so the review workspace cannot embed
// a page in an iframe and cannot render a live preview. Captures therefore happen
// IN the page, in the operator's own authenticated session, using html2canvas.
//
// That turns out to be better than an external runner: no review account, no
// stored credentials, no separate infrastructure, and the capture is exactly what
// the operator was looking at.
//
// The one thing it does introduce is personal data. A screenshot of the Leads
// page contains real names, emails and phone numbers. Masking is therefore ON by
// default and is applied to a CLONE of the DOM before rasterising, so the live
// page the operator is using is never altered.

/* ---------------------------------------------------------------- *
 * Masking
 * ---------------------------------------------------------------- */

// Redact a cloned document. Never called on the live DOM.
function maskClone(doc) {
  let count = 0;

  PII_SELECTORS.forEach((sel) => {
    let nodes = [];
    try { nodes = Array.from(doc.querySelectorAll(sel)); } catch { nodes = []; }
    nodes.forEach((el) => {
      if (el.textContent && el.textContent.trim()) {
        el.textContent = blockOut(el.textContent);
        count += 1;
      }
    });
  });

  // Input values are not in text nodes.
  Array.from(doc.querySelectorAll('input, textarea')).forEach((el) => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'password') {
      el.setAttribute('value', '');
      count += 1;
      return;
    }
    const v = el.value || el.getAttribute('value');
    if (!v) return;
    const { text, hits } = maskText(v);
    if (hits > 0) {
      el.setAttribute('value', text);
      if ('value' in el) el.value = text;
      count += hits;
    }
  });

  // Pattern based sweep over remaining text nodes.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
  const pending = [];
  while (walker.nextNode()) pending.push(walker.currentNode);
  pending.forEach((node) => {
    const { text, hits } = maskText(node.nodeValue);
    if (hits > 0) {
      node.nodeValue = text;
      count += hits;
    }
  });

  return count;
}

/* ---------------------------------------------------------------- *
 * Capture
 * ---------------------------------------------------------------- */

export { VIEWPORTS, viewportFor, maskText };

const canvasToFile = (canvas, name) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) { reject(new Error('Canvas produced no image data')); return; }
    resolve(new File([blob], name, { type: 'image/png' }));
  }, 'image/png');
});

// Rasterise a DOM element. Returns { canvas, maskCount }.
// `width` forces the layout width, which is what makes an offscreen tablet or
// mobile capture possible from a desktop browser.
export async function rasterise(target, { mask = true, width } = {}) {
  let maskCount = 0;
  const canvas = await html2canvas(target, {
    backgroundColor: getComputedStyle(document.body).backgroundColor || null,
    useCORS: true,
    logging: false,
    // Cap the pixel ratio: a retina capture of a tall page is enormous and the
    // extra detail buys nothing for review.
    scale: Math.min(window.devicePixelRatio || 1, 1.5),
    windowWidth: width || document.documentElement.clientWidth,
    width: width || undefined,
    // Without an explicit height a tall page is cropped to the viewport. The
    // element's own scroll height is the whole page.
    height: width ? Math.max(target.scrollHeight || 0, 600) : undefined,
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDoc) => {
      if (mask) {
        try { maskCount = maskClone(clonedDoc); } catch { maskCount = -1; }
      }
      // Hide the capture controls so they do not appear in the shot. The
      // offscreen host carries the same attribute (so it stays out of ordinary
      // in-page captures) but it IS the target here, so it must be exempt.
      // Hiding it produced an empty canvas on every offscreen capture.
      clonedDoc.querySelectorAll('[data-progress-capture-ui]').forEach((el) => {
        if (el.hasAttribute('data-offscreen-capture')) return;
        if (el.querySelector?.('[data-offscreen-capture]')) return;
        el.style.display = 'none';
      });
      // The live host is transparent and parked behind the page so it cannot be
      // seen or clicked. In the clone it has to be fully visible and at the
      // origin, otherwise there is nothing to rasterise.
      clonedDoc.querySelectorAll('[data-offscreen-capture]').forEach((el) => {
        el.style.opacity = '1';
        el.style.position = 'static';
        el.style.left = '0';
        el.style.top = '0';
        el.style.zIndex = 'auto';
        el.style.visibility = 'visible';
      });
    },
  });
  return { canvas, maskCount };
}

/**
 * Store a capture of a specific element at an explicit viewport and width.
 *
 * Used by the offscreen capturer, where the container width is chosen rather
 * than inherited from the window, so desktop, tablet and mobile can all be
 * captured from one browser at any size.
 *
 * Always resolves to a PageSnapshot. A failure is recorded as a failed capture
 * rather than thrown away, so a page with no usable screenshot reads as failed
 * instead of as a page nobody looked at.
 */
export async function capturePageElement({
  pageKey,
  route,
  element,
  viewport,
  width,
  mask = true,
  role,
  capturedBy,
  notes,
  forcedError,
}) {
  const base = {
    page_key: pageKey,
    route,
    viewport,
    width,
    masked: mask,
    theme: document.documentElement.classList.contains('light') ? 'light' : 'dark',
    role_used: role || null,
    app_commit: manifest.app_commit || null,
    captured_by: capturedBy || null,
    captured_at: new Date().toISOString(),
    notes: notes || null,
  };

  if (forcedError || !element) {
    return base44.entities.PageSnapshot.create({
      ...base,
      height: 0,
      capture_status: 'failed',
      failure_reason: String(forcedError || 'No element to capture').slice(0, 500),
      mask_count: 0,
      superseded: false,
    });
  }

  try {
    const { canvas, maskCount } = await rasterise(element, { mask, width });
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('Rasteriser returned an empty canvas');
    }
    const file = await canvasToFile(canvas, `${pageKey}-${viewport}-${Date.now()}.png`);
    const { file_url: imageUrl } = await base44.integrations.Core.UploadFile({ file });

    await supersedePrior(pageKey, viewport);

    return base44.entities.PageSnapshot.create({
      ...base,
      height: canvas.height,
      image_url: imageUrl,
      capture_status: 'ok',
      mask_count: maskCount,
      superseded: false,
    });
  } catch (err) {
    return base44.entities.PageSnapshot.create({
      ...base,
      height: 0,
      capture_status: 'failed',
      failure_reason: String(err?.message || err).slice(0, 500),
      mask_count: 0,
      superseded: false,
    });
  }
}

// Older captures for the same page and viewport stop being the current one.
async function supersedePrior(pageKey, viewport) {
  try {
    const prior = (await base44.entities.PageSnapshot.filter({
      page_key: pageKey,
      viewport,
      superseded: false,
    })) || [];
    for (const p of prior) {
      await base44.entities.PageSnapshot.update(p.id, { superseded: true });
    }
  } catch {
    // Superseding is housekeeping. A failure here must not lose the capture.
  }
}

/**
 * Capture the page the operator is currently on and store it as a PageSnapshot.
 * Failures are recorded rather than swallowed, so a page with no usable capture
 * reads as a failed capture instead of as a page nobody has looked at.
 */
export async function capturePage({
  pageKey,
  route,
  target,
  mask = true,
  role,
  capturedBy,
  notes,
}) {
  const width = document.documentElement.clientWidth;
  const viewport = viewportFor(width);
  const base = {
    page_key: pageKey,
    route,
    viewport,
    width,
    masked: mask,
    theme: document.documentElement.classList.contains('light') ? 'light' : 'dark',
    role_used: role || null,
    app_commit: manifest.app_commit || null,
    captured_by: capturedBy || null,
    captured_at: new Date().toISOString(),
    notes: notes || null,
  };

  try {
    const el = target || document.querySelector('main') || document.body;
    const { canvas, maskCount } = await rasterise(el, { mask });
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error('Rasteriser returned an empty canvas');
    }
    const file = await canvasToFile(canvas, `${pageKey}-${viewport}-${Date.now()}.png`);
    const { file_url: imageUrl } = await base44.integrations.Core.UploadFile({ file });

    await supersedePrior(pageKey, viewport);

    return base44.entities.PageSnapshot.create({
      ...base,
      height: canvas.height,
      image_url: imageUrl,
      capture_status: 'ok',
      mask_count: maskCount,
      superseded: false,
    });
  } catch (err) {
    return base44.entities.PageSnapshot.create({
      ...base,
      height: 0,
      capture_status: 'failed',
      failure_reason: String(err?.message || err).slice(0, 500),
      mask_count: 0,
      superseded: false,
    });
  }
}

/* ---------------------------------------------------------------- *
 * Region crops, for anchored comments
 * ---------------------------------------------------------------- */

// Crop a stored snapshot to the drawn region and upload just that piece. The
// crop is what makes a comment readable six weeks later without hunting through
// a full page capture.
export async function cropAndUpload(imageUrl, region, name = 'region') {
  const img = await loadImage(imageUrl);
  const x = Math.max(0, Math.round(region.x));
  const y = Math.max(0, Math.round(region.y));
  const w = Math.max(1, Math.round(region.w));
  const h = Math.max(1, Math.round(region.h));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

  const file = await canvasToFile(canvas, `${name}-${Date.now()}.png`);
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return file_url;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the snapshot image for cropping'));
    img.src = src;
  });
}

/* ---------------------------------------------------------------- *
 * Element identification
 * ---------------------------------------------------------------- */

// Best effort CSS path for an element, used to tell an implementer exactly which
// thing was pointed at. Prefers a stable data-audit-id when the component has one.
export function describeElement(el) {
  if (!el || !el.tagName) return { selector: '', auditId: '', label: '', value: '' };

  const auditId = el.closest?.('[data-audit-id]')?.getAttribute('data-audit-id') || '';
  const parts = [];
  let node = el;
  let depth = 0;
  while (node && node.tagName && node.tagName.toLowerCase() !== 'body' && depth < 6) {
    let part = node.tagName.toLowerCase();
    const testId = node.getAttribute?.('data-audit-id');
    if (testId) { parts.unshift(`[data-audit-id="${testId}"]`); break; }
    const cls = (node.getAttribute?.('class') || '')
      .split(/\s+/)
      .filter((c) => c && !c.startsWith('hover:') && !c.startsWith('focus:') && c.length < 24)
      .slice(0, 2);
    if (cls.length) part += `.${cls.join('.')}`;
    parts.unshift(part);
    node = node.parentElement;
    depth += 1;
  }

  const label = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  return { selector: parts.join(' > '), auditId, label, value: label };
}
