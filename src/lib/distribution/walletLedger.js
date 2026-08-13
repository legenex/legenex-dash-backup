// Wallet ledger operations over the CAS wallet store (walletStore.js). Debits and
// credits are idempotent (atomic claim on the idempotency key) and balance-safe
// (versioned CAS retry), so parallel debits never lose updates, duplicates apply
// at most once, and the balance never drops below the approved floor.

export const WALLET = { LOW_BALANCE: 'LOW_BALANCE', OVER_CREDIT_LIMIT: 'OVER_CREDIT_LIMIT' };

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

// Idempotent debit. floor = 0 unless an approved creditLimit allows negative.
export async function walletDebit(store, { buyerId, amount, idempotencyKey, creditLimit = null, type = 'debit', description = '' }) {
  const amt = Number(amount);
  const won = await store.claimTxn(idempotencyKey);
  if (!won) {
    const existing = await store.awaitTxnByKey(idempotencyKey);
    return { applied: false, duplicate: true, txn: existing, balanceAfter: existing?.balance_after };
  }
  const floor = creditLimit == null ? 0 : -Math.abs(Number(creditLimit));
  for (let i = 0; i < 200; i++) {
    const { balance, version } = await store.getBalance(buyerId);
    const after = round2(balance - amt);
    if (after < floor) {
      // Persist a rejected marker so concurrent duplicates resolve idempotently.
      const rej = await store.appendTxn({
        buyer_id: buyerId, type, amount: amt, balance_after: balance,
        idempotency_key: idempotencyKey, status: 'rejected', description,
      });
      return { applied: false, insufficient: true, code: creditLimit == null ? WALLET.LOW_BALANCE : WALLET.OVER_CREDIT_LIMIT, balanceAfter: balance, txn: rej };
    }
    const ok = await store.casAdjustBalance(buyerId, version, after);
    if (!ok) continue; // CAS lost, another writer moved balance; retry
    const txn = await store.appendTxn({
      buyer_id: buyerId, type, amount: amt, balance_after: after,
      idempotency_key: idempotencyKey, status: 'applied', description,
    });
    return { applied: true, txn, balanceAfter: after };
  }
  return { applied: false, error: 'cas_exhausted' };
}

// Idempotent credit / recharge / return-credit. Always allowed (raises balance).
export async function walletCredit(store, { buyerId, amount, idempotencyKey, type = 'credit', description = '' }) {
  const amt = Number(amount);
  const won = await store.claimTxn(idempotencyKey);
  if (!won) {
    const existing = await store.awaitTxnByKey(idempotencyKey);
    return { applied: false, duplicate: true, txn: existing, balanceAfter: existing?.balance_after };
  }
  for (let i = 0; i < 200; i++) {
    const { balance, version } = await store.getBalance(buyerId);
    const after = round2(balance + amt);
    const ok = await store.casAdjustBalance(buyerId, version, after);
    if (!ok) continue;
    const txn = await store.appendTxn({
      buyer_id: buyerId, type, amount: amt, balance_after: after,
      idempotency_key: idempotencyKey, status: 'applied', description,
    });
    return { applied: true, txn, balanceAfter: after };
  }
  return { applied: false, error: 'cas_exhausted' };
}

// Return credit keyed by the return id so a repeated return webhook credits once.
export async function walletCreditReturn(store, { buyerId, amount, returnId }) {
  return walletCredit(store, { buyerId, amount, idempotencyKey: `return:${returnId}`, type: 'adjustment', description: `return ${returnId}` });
}
