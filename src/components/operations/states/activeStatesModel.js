// Pure helpers for the Active States surface. No entity reads here; callers
// pass in already-fetched StateStatus, Buyer and BuyerStateCpl rows.

// The 50 states plus DC. StateStatus rows only exist where coverage was
// computed, so the page always renders against this full list and treats a
// missing StateStatus row as an uncovered state.
export const ALL_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

// A buyer only counts toward tier resolution when its lifecycle status is
// active. Paused, terminated, draft and launching buyers are excluded even
// when their BuyerStateCpl row is flagged active.
export function buyerCounts(buyer) {
  return (buyer?.status || '').toLowerCase() === 'active';
}

// Build a lookup of StateStatus rows for a vertical, keyed by state code.
export function statusByState(stateStatuses, vertical) {
  const map = {};
  for (const s of stateStatuses || []) {
    if (s.vertical === vertical) map[s.state] = s;
  }
  return map;
}

// Buyers that hold an active BuyerStateCpl row in this vertical + state, joined
// to their Buyer record. Includes buyers that do not count toward resolution
// so the drawer can explain the exclusion.
export function buyersInState(state, vertical, cplRows, buyers) {
  const byId = {};
  for (const b of buyers || []) byId[b.id] = b;
  return (cplRows || [])
    .filter((r) => r.state === state && r.vertical === vertical)
    .map((r) => {
      const buyer = byId[r.buyer_id] || null;
      const counts = !!r.active && buyerCounts(buyer);
      return { row: r, buyer, counts };
    })
    .filter((x) => x.buyer);
}

// Winning buyer for a state's resolved tier: among buyers that count, the one
// whose CPL equals the state's highest_cpl. Falls back to the highest CPL row
// when StateStatus is absent. Returns null when nothing counts.
export function resolveWinner(state, vertical, cplRows, buyers, status) {
  const counting = buyersInState(state, vertical, cplRows, buyers).filter((x) => x.counts);
  if (counting.length === 0) return null;
  const target = status && status.highest_cpl != null ? Number(status.highest_cpl) : null;
  let winner = counting[0];
  for (const x of counting) {
    if (target != null && Number(x.row.cpl) === target) return x;
    if (Number(x.row.cpl) > Number(winner.row.cpl)) winner = x;
  }
  return winner;
}

// A buyer-scoped coverage view: when a Buyer filter is applied, the map and
// table show that buyer's own BuyerStateCpl rows rather than the resolved
// StateStatus tier. Returns a { [state]: syntheticStatus } map shaped like
// StateStatus so the same renderers work.
export function buyerCoverageByState(buyerId, vertical, cplRows, buyers) {
  const buyer = (buyers || []).find((b) => b.id === buyerId) || null;
  const tier = buyer?.client_type || null;
  const map = {};
  for (const r of cplRows || []) {
    if (r.buyer_id !== buyerId || r.vertical !== vertical) continue;
    map[r.state] = {
      state: r.state,
      vertical,
      active: !!r.active,
      effective_client_type: r.active ? tier : null,
      highest_cpl: Number(r.cpl) || 0,
      lowest_cpl: Number(r.cpl) || 0,
      active_buyer_count: r.active ? 1 : 0,
      last_changed_at: r.updated_date || null,
      last_change_direction: null,
      _buyerScoped: true,
    };
  }
  return map;
}