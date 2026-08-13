// Concurrency-safe wallet store on the same proven CAS primitive as capStore.
// Balance lives in a versioned record updated via updateMany compare-and-swap on
// {id, version}; the WalletTransaction ledger is append-only. An atomic claim on
// the idempotency key guarantees a debit/credit applies at most once even under
// concurrent duplicate requests. No assumed unique index or transaction.
//
// Interface (async):
//   claimTxn(idempotencyKey) -> boolean            // atomic; one winner per key
//   getBalance(buyerId) -> { balance, version }
//   casAdjustBalance(buyerId, expectedVersion, newBalance) -> boolean
//   appendTxn(txn) -> txn                           // append-only ledger write
//   getTxnByKey(idempotencyKey) -> txn | null
//   awaitTxnByKey(idempotencyKey) -> txn

// ---- Honest in-memory CAS wallet store (for tests) ----
export function makeInMemoryWalletStore({ initial = {}, yieldFn } = {}) {
  const balances = new Map(); // buyerId -> { balance, version }
  for (const [b, v] of Object.entries(initial)) balances.set(b, { balance: v, version: 0 });
  const claims = new Map();
  const txns = [];
  let seq = 0;
  const microYield = yieldFn || (() => new Promise((r) => setTimeout(r, 0)));

  async function claimTxn(key) {
    const cur = claims.get(key);
    await microYield();
    if (claims.get(key) || cur) return false;
    claims.set(key, true);
    return true;
  }
  async function getBalance(buyerId) {
    return balances.get(buyerId) || { balance: 0, version: 0 };
  }
  async function casAdjustBalance(buyerId, expectedVersion, newBalance) {
    const cur = balances.get(buyerId) || { balance: 0, version: 0 };
    await microYield(); // race window between read and commit
    const latest = balances.get(buyerId) || { balance: 0, version: 0 };
    if (latest.version !== expectedVersion) return false; // CAS lost
    balances.set(buyerId, { balance: newBalance, version: expectedVersion + 1 });
    return true;
  }
  async function appendTxn(txn) {
    const row = { ...txn, id: 't' + (++seq) };
    txns.push(row);
    return row;
  }
  async function getTxnByKey(key) {
    return txns.find((t) => t.idempotency_key === key) || null;
  }
  async function awaitTxnByKey(key, tries = 1000) {
    for (let i = 0; i < tries; i++) {
      const t = await getTxnByKey(key);
      if (t) return t;
      await microYield();
    }
    return null;
  }
  return {
    claimTxn, getBalance, casAdjustBalance, appendTxn, getTxnByKey, awaitTxnByKey,
    _debug: { balances, txns },
  };
}

// ---- Real Base44 adapter (NEEDS-ENV to verify live) ----
// Balance in a versioned BuyerWallet record; ledger in WalletTransaction.
export function makeBase44WalletStore(db) {
  async function ensureWallet(buyerId) {
    let rows = await db.entities.BuyerWallet.filter({ buyer_id: buyerId });
    if (!rows.length) {
      await db.entities.BuyerWallet.create({ buyer_id: buyerId, balance: 0, version: 0 });
      rows = await db.entities.BuyerWallet.filter({ buyer_id: buyerId });
    }
    rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return rows[0];
  }
  async function claimTxn(key) {
    // one-shot CAS claim on a dedicated counter row
    for (let i = 0; i < 25; i++) {
      let rows = await db.entities.CapCounter.filter({ scope_key: `walletclaim:${key}` });
      if (!rows.length) { await db.entities.CapCounter.create({ scope_key: `walletclaim:${key}`, count: 0 }); rows = await db.entities.CapCounter.filter({ scope_key: `walletclaim:${key}` }); }
      rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const row = rows[0];
      if (Number(row.count || 0) >= 1) return false;
      const res = await db.entities.CapCounter.updateMany({ id: row.id, count: 0 }, { $set: { count: 1 } });
      if (res && res.updated > 0) return true;
    }
    return false;
  }
  async function getBalance(buyerId) {
    const w = await ensureWallet(buyerId);
    return { balance: Number(w.balance || 0), version: Number(w.version || 0), _id: w.id };
  }
  async function casAdjustBalance(buyerId, expectedVersion, newBalance) {
    const w = await ensureWallet(buyerId);
    if (Number(w.version || 0) !== expectedVersion) return false;
    const res = await db.entities.BuyerWallet.updateMany(
      { id: w.id, version: expectedVersion }, { $set: { balance: newBalance, version: expectedVersion + 1 } },
    );
    return !!(res && res.updated > 0);
  }
  async function appendTxn(txn) { return db.entities.WalletTransaction.create(txn); }
  async function getTxnByKey(key) {
    const rows = await db.entities.WalletTransaction.filter({ idempotency_key: key });
    return rows[0] || null;
  }
  async function awaitTxnByKey(key, tries = 20) {
    for (let i = 0; i < tries; i++) {
      const t = await getTxnByKey(key);
      if (t) return t;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }
  return { claimTxn, getBalance, casAdjustBalance, appendTxn, getTxnByKey, awaitTxnByKey };
}
