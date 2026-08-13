// Delivery-attempt persistence. In-memory mock for tests; real Base44 adapter for
// production (NEEDS-ENV to verify live). Attempts are created BEFORE send so a
// crash mid-send leaves a durable record to recover.

export function makeInMemoryAttemptStore({ yieldFn } = {}) {
  const attempts = [];
  const bids = [];
  let seq = 0;
  const microYield = yieldFn || (() => new Promise((r) => setTimeout(r, 0)));
  return {
    async createAttempt(rec) { const row = { ...rec, id: 'a' + (++seq) }; attempts.push(row); return row; },
    async updateAttempt(id, patch) { const a = attempts.find((x) => x.id === id); if (a) Object.assign(a, patch); return a; },
    async getAttempt(id) { return attempts.find((x) => x.id === id) || null; },
    async listDue(nowMs) {
      return attempts.filter((a) => a.status === 'error' && a.next_retry_at != null
        && Date.parse(a.next_retry_at) <= nowMs && (a.lease_until == null || Date.parse(a.lease_until) <= nowMs));
    },
    // Atomic lease claim (honest CAS on lease_version). Exactly one concurrent
    // worker wins an unleased (or expired-lease) attempt.
    async claimLease(id, workerId, nowMs, leaseMs) {
      const a = attempts.find((x) => x.id === id);
      if (!a) return false;
      const version = a.lease_version || 0;
      await microYield(); // race window
      const latest = attempts.find((x) => x.id === id);
      const activeLease = latest.lease_until ? Date.parse(latest.lease_until) : 0;
      if (activeLease > nowMs) return false;                 // still leased by someone
      if ((latest.lease_version || 0) !== version) return false; // CAS lost
      latest.lease_until = new Date(nowMs + leaseMs).toISOString();
      latest.leased_by = workerId;
      latest.lease_version = version + 1;
      return true;
    },
    // BidAttempt persistence (ping-post).
    async createBid(rec) { const row = { ...rec, id: 'b' + (++seq) }; bids.push(row); return row; },
    async updateBid(id, patch) { const b = bids.find((x) => x.id === id); if (b) Object.assign(b, patch); return b; },
    _debug: { attempts, bids },
  };
}

export function makeBase44AttemptStore(db) {
  return {
    async createAttempt(rec) { return db.entities.DeliveryAttempt.create(rec); },
    async updateAttempt(id, patch) { return db.entities.DeliveryAttempt.update(id, patch); },
    async getAttempt(id) { const rows = await db.entities.DeliveryAttempt.filter({ id }); return rows[0] || null; },
    async listDue(nowMs, limit = 100) {
      const iso = new Date(nowMs).toISOString();
      const rows = await db.entities.DeliveryAttempt.filter({ status: 'error' }, 'next_retry_at', limit);
      return rows.filter((a) => a.next_retry_at && a.next_retry_at <= iso
        && (!a.lease_until || a.lease_until <= iso));
    },
    async claimLease(id, workerId, nowMs, leaseMs) {
      const rows = await db.entities.DeliveryAttempt.filter({ id });
      const a = rows[0];
      if (!a) return false;
      const activeLease = a.lease_until ? Date.parse(a.lease_until) : 0;
      if (activeLease > nowMs) return false;
      const version = a.lease_version || 0;
      // CAS: only claim if lease_version is still what we read.
      const res = await db.entities.DeliveryAttempt.updateMany(
        { id, lease_version: version },
        { $set: { lease_until: new Date(nowMs + leaseMs).toISOString(), leased_by: workerId, lease_version: version + 1 } },
      );
      return !!(res && res.updated > 0);
    },
    async createBid(rec) { return db.entities.BidAttempt.create(rec); },
    async updateBid(id, patch) { return db.entities.BidAttempt.update(id, patch); },
  };
}
