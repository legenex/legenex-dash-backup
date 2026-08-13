// Pure helpers for the Supplier Management list. No entity access here.

// All SupplierSource rows belonging to a supplier.
export function sourcesForSupplier(supplierId, sources) {
  return sources.filter((s) => s.supplier_id === supplierId);
}

// Count of SupplierSource rows for a supplier.
export function sourceCount(supplierId, sources) {
  return sourcesForSupplier(supplierId, sources).length;
}

// Ordered list of source_code values for a supplier.
export function sourceCodes(supplierId, sources) {
  return sourcesForSupplier(supplierId, sources)
    .map((s) => s.source_code)
    .filter(Boolean);
}

// Notification channel health for a supplier. Returns one of:
//   'ok'      positive: at least one channel and notifications not muted
//   'muted'   warning: channels exist but notify_on_state_change is false
//   'none'    accent: active supplier with no channel configured
//   'idle'    neutral: not active and no channel (nothing at risk)
export function channelHealth(supplier) {
  const hasChannel = !!(
    supplier.notify_email ||
    supplier.notify_slack_channel ||
    supplier.notify_whatsapp
  );
  const muted = supplier.notify_on_state_change === false;
  const isActive = String(supplier.status || '').toLowerCase() === 'active';

  if (hasChannel && !muted) return 'ok';
  if (hasChannel && muted) return 'muted';
  if (isActive) return 'none';
  return 'idle';
}

// Active suppliers with no notification channel. These keep sending leads into
// a state that has closed, with no way to be told it closed.
export function suppliersWithNoChannel(suppliers) {
  return suppliers.filter((s) => channelHealth(s) === 'none');
}