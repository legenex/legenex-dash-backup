// Pure helpers for the Buyer Management list surface. No entity reads here;
// callers pass in already-fetched Buyer, BuyerStateCpl and StateStatus rows.

// Active BuyerStateCpl rows for a given buyer.
export function activeCplRows(buyerId, cplRows) {
  return (cplRows || []).filter((r) => r.buyer_id === buyerId && r.active);
}

// Count of active states for a buyer, derived from BuyerStateCpl.
export function activeStateCount(buyerId, cplRows) {
  return activeCplRows(buyerId, cplRows).length;
}

// CPL range (lowest to highest) across a buyer's active rows. Returns null when
// the buyer has no active rows, so the table can leave the cell blank rather
// than render a zero range.
export function cplRange(buyerId, cplRows) {
  const rows = activeCplRows(buyerId, cplRows);
  const values = rows.map((r) => Number(r.cpl)).filter((n) => Number.isFinite(n));
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return { lo, hi };
}

// The states this buyer would close if paused: states where this buyer is
// currently the only active buyer. Computed from BuyerStateCpl (which buyers
// are active where) cross-referenced with StateStatus (which states are open).
// Returns a sorted array of two letter state codes.
export function computeBlastRadius(buyerId, cplRows, stateStatuses) {
  const mine = activeCplRows(buyerId, cplRows);
  const closes = [];
  for (const row of mine) {
    const state = row.state;
    const vertical = row.vertical;
    // Every other buyer active in this same vertical + state.
    const otherActive = (cplRows || []).some(
      (r) => r.buyer_id !== buyerId && r.active && r.state === state && r.vertical === vertical
    );
    if (otherActive) continue;
    // Only counts as a closure if the state is currently open.
    const ss = (stateStatuses || []).find((s) => s.state === state && s.vertical === vertical);
    if (ss && ss.active) {
      if (!closes.includes(state)) closes.push(state);
    }
  }
  return closes.sort();
}

// Human readable list: ["GA","MO","NV"] -> "GA, MO and NV".
export function joinStates(states) {
  if (!states || states.length === 0) return '';
  if (states.length === 1) return states[0];
  return `${states.slice(0, -1).join(', ')} and ${states[states.length - 1]}`;
}