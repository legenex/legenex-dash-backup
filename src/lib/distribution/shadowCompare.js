// Pure shadow comparison. Pairs a legacy LeadByte outcome with the native engine
// decision (from a RouteDecisionTrace, resolved to buyer/destination) and assigns
// one category from the full taxonomy (PB-020). No I/O.

export const COMPARE = {
  EXACT_MATCH: 'exact_match',                 // both routed identically, or both declined
  BUYER_MISMATCH: 'buyer_mismatch',
  DESTINATION_MISMATCH: 'destination_mismatch',
  PRICE_MISMATCH: 'price_mismatch',
  STATUS_MISMATCH: 'status_mismatch',
  LEGACY_ONLY: 'legacy_only',                 // legacy routed, native did not
  NATIVE_ONLY: 'native_only',                 // native routed, legacy did not
  QUALIFICATION_MISMATCH: 'qualification_mismatch',
  CONFIGURATION_ERROR: 'configuration_error',
  EVALUATION_ERROR: 'evaluation_error',
};

const AGREE = new Set([COMPARE.EXACT_MATCH]);

function eqNum(a, b) { return Math.abs(Number(a || 0) - Number(b || 0)) < 0.005; }

// legacy: { routed, buyerId, destinationId, price, status }
// native: { routed, buyerId, destinationId, price, status, evalError, configError,
//           legacyBuyerExcludedReason }
export function compareDecision(legacy = {}, native = {}) {
  if (native.evalError) return cat(COMPARE.EVALUATION_ERROR);
  if (native.configError) return cat(COMPARE.CONFIGURATION_ERROR);

  const lr = !!legacy.routed;
  const nr = !!native.routed;

  if (!lr && !nr) return cat(COMPARE.EXACT_MATCH);       // both declined = agreement
  if (lr && !nr) {
    // legacy routed but native excluded: qualification is called out specifically
    if (String(native.legacyBuyerExcludedReason || '').toUpperCase().includes('QUALIFICATION')) {
      return cat(COMPARE.QUALIFICATION_MISMATCH);
    }
    return cat(COMPARE.LEGACY_ONLY);
  }
  if (!lr && nr) return cat(COMPARE.NATIVE_ONLY);

  // both routed
  if (String(legacy.buyerId) !== String(native.buyerId)) return cat(COMPARE.BUYER_MISMATCH);
  if (String(legacy.destinationId) !== String(native.destinationId)) return cat(COMPARE.DESTINATION_MISMATCH);
  if (!eqNum(legacy.price, native.price)) return cat(COMPARE.PRICE_MISMATCH);
  if (String(legacy.status || '').toLowerCase() !== String(native.status || '').toLowerCase()) return cat(COMPARE.STATUS_MISMATCH);
  return cat(COMPARE.EXACT_MATCH);
}

function cat(category) { return { category, agree: AGREE.has(category) }; }

export function summarizeComparisons(pairs) {
  const counts = Object.fromEntries(Object.values(COMPARE).map((c) => [c, 0]));
  for (const p of pairs || []) counts[compareDecision(p.legacy, p.native).category] += 1;
  const total = (pairs || []).length;
  const agreements = counts[COMPARE.EXACT_MATCH];
  const discrepancies = total - agreements;
  return { total, counts, agreements, discrepancies, discrepancyRate: total ? round4(discrepancies / total) : 0 };
}

function round4(n) { return Math.round(n * 10000) / 10000; }
