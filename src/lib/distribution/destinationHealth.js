// Destination circuit breaker. Opens after N consecutive failures, stays open for
// a cooldown, then half-opens; a success closes it. Pure decision logic over an
// injected health store (in-memory mock or Base44 adapter).

export const CIRCUIT = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' };

export function nextHealth(cur, success, nowMs, opts = {}) {
  const threshold = opts.failureThreshold ?? 5;
  const cooldownMs = opts.cooldownMs ?? 60000;
  const h = cur || { state: CIRCUIT.CLOSED, consecutive_failures: 0 };
  if (success) {
    return { state: CIRCUIT.CLOSED, consecutive_failures: 0, last_success_at: new Date(nowMs).toISOString(), disabled_until: null };
  }
  const failures = (h.consecutive_failures || 0) + 1;
  const open = failures >= threshold;
  return {
    state: open ? CIRCUIT.OPEN : h.state === CIRCUIT.HALF_OPEN ? CIRCUIT.OPEN : CIRCUIT.CLOSED,
    consecutive_failures: failures,
    last_failure_at: new Date(nowMs).toISOString(),
    disabled_until: open ? new Date(nowMs + cooldownMs).toISOString() : (h.disabled_until || null),
  };
}

// Is the destination currently blocked from sending? Open until disabled_until,
// then half-open (allow a trial send).
export function isBlocked(h, nowMs) {
  if (!h || h.state === CIRCUIT.CLOSED) return false;
  if (h.state === CIRCUIT.OPEN) {
    if (h.disabled_until && Date.parse(h.disabled_until) > nowMs) return true;
    return false; // cooldown elapsed -> allow a half-open trial
  }
  return false;
}

export function makeInMemoryHealthStore() {
  const map = new Map();
  return {
    async get(destId) { return map.get(destId) || null; },
    async set(destId, h) { map.set(destId, h); return h; },
    async recordResult(destId, success, nowMs, opts) {
      const next = nextHealth(map.get(destId), success, nowMs, opts);
      map.set(destId, next);
      return next;
    },
    _debug: { map },
  };
}

export function makeBase44HealthStore(db) {
  async function get(destId) {
    const rows = await db.entities.DestinationHealth.filter({ destination_id: destId });
    return rows[0] || null;
  }
  return {
    get,
    async set(destId, h) {
      const rows = await db.entities.DestinationHealth.filter({ destination_id: destId });
      if (rows[0]) return db.entities.DestinationHealth.update(rows[0].id, h);
      return db.entities.DestinationHealth.create({ destination_id: destId, ...h });
    },
    async recordResult(destId, success, nowMs, opts) {
      const cur = await get(destId);
      const next = nextHealth(cur, success, nowMs, opts);
      await this.set(destId, next);
      return next;
    },
  };
}
