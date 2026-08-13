// Canonical supplier and supplier-source option list.
//
// A supplier source IS the ssid. They are created in Operations under a
// supplier (CAC-CALLS, DS-CALLS, CMC-LEADS and so on) and the supplier's own
// code is the sid. Those two always travel together: CAC-CALLS only ever
// belongs to LGNX.
//
// Every surface that asks an operator for a sid or an ssid must offer this list
// rather than a text box. Typing them by hand is how a call ends up attributed
// to a supplier that does not exist: nothing rejects the value, the call simply
// never joins to anything and the money lands nowhere. One pick sets all three
// fields, so the pair can never disagree.

export const SUPPLIER_ONLY = '__supplier_only__';

// Build the flat option list a select can render.
//
// Sources are grouped under their supplier and labelled with the supplier code,
// because DS-CALLS on its own does not tell you it is Legenex traffic.
export function buildSupplierSourceOptions(suppliers = [], sources = []) {
  const byId = new Map();
  for (const s of suppliers || []) {
    if (s && s.id) byId.set(s.id, s);
  }

  const options = [];
  const index = new Map();

  const push = (opt) => {
    options.push({ value: opt.value, label: opt.label });
    index.set(opt.value, opt);
  };

  // Sources first, sorted by supplier then source code, so the list reads the
  // way the Operations screen does.
  const usable = (sources || [])
    .filter((src) => src && src.source_code && src.active !== false)
    .map((src) => ({ src, supplier: byId.get(src.supplier_id) || null }))
    .filter((x) => x.supplier)
    .sort((a, b) => {
      const s = String(a.supplier.name || '').localeCompare(String(b.supplier.name || ''));
      if (s !== 0) return s;
      return String(a.src.source_code).localeCompare(String(b.src.source_code));
    });

  for (const { src, supplier } of usable) {
    const sid = String(supplier.sid || '').trim();
    const ssid = String(src.source_code).trim();
    push({
      value: `${sid}::${ssid}`,
      label: `${ssid}  ·  ${supplier.name}${sid ? ` (${sid})` : ''}`,
      sid,
      ssid,
      supplier_name: supplier.name || '',
      brand: src.brand || '',
    });
  }

  // Then each supplier on its own, for traffic that is genuinely supplier level
  // and carries no source. Kept below the sources so the specific choice is the
  // one an operator reaches first.
  const activeSuppliers = (suppliers || [])
    .filter((s) => s && s.name && s.active !== false)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  for (const supplier of activeSuppliers) {
    const sid = String(supplier.sid || '').trim();
    push({
      value: `${sid}::${SUPPLIER_ONLY}`,
      label: `${supplier.name}${sid ? ` (${sid})` : ''}  ·  no source`,
      sid,
      ssid: '',
      supplier_name: supplier.name || '',
      brand: '',
    });
  }

  return { options, index };
}

// The select value for a rule that is already saved.
//
// Rules saved before this list existed can hold a sid/ssid pair that matches no
// current source. That is exactly the state worth surfacing rather than hiding,
// so this returns '' and the caller shows the stored values as an unrecognised
// pairing instead of silently snapping to something that looks close.
export function optionValueForRule(rule, index) {
  const sid = String(rule?.sid || '').trim();
  const ssid = String(rule?.ssid || '').trim();
  if (!sid && !ssid) return '';
  const exact = `${sid}::${ssid || SUPPLIER_ONLY}`;
  if (index && index.has(exact)) return exact;
  return '';
}

// What a rule should carry once an option is chosen. Returns all three fields
// together so a caller cannot set one and forget another.
export function resolutionForOption(value, index) {
  const opt = index?.get(value);
  if (!opt) return { sid: '', ssid: '', supplier_name: '' };
  return { sid: opt.sid, ssid: opt.ssid, supplier_name: opt.supplier_name };
}

// Suppliers on their own, for the sid half of a rule. The ssid is chosen
// separately and depends on which supplier was picked, so the two are offered
// as two controls rather than one merged list.
export function buildSupplierOptions(suppliers = []) {
  return (suppliers || [])
    .filter((s) => s && s.name && s.active !== false && String(s.sid || '').trim())
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((s) => ({ value: String(s.sid).trim(), label: `${String(s.sid).trim()}  \u00b7  ${s.name}` }));
}

// The sources belonging to one supplier, for the ssid half.
//
// Deliberately scoped to the chosen sid: a source only ever belongs to one
// supplier, so offering CAC-CALLS under a supplier that does not own it would
// let an operator build a pairing that cannot exist. Blank is valid and means
// supplier level with no source.
export function sourceOptionsForSid(sid, suppliers = [], sources = []) {
  const want = String(sid || '').trim().toLowerCase();
  if (!want) return [];
  const owner = (suppliers || []).find((s) => String(s?.sid || '').trim().toLowerCase() === want);
  if (!owner) return [];
  return (sources || [])
    .filter((src) => src && src.supplier_id === owner.id && src.source_code && src.active !== false)
    .sort((a, b) => String(a.source_code).localeCompare(String(b.source_code)))
    .map((src) => ({
      value: String(src.source_code).trim(),
      label: src.brand ? `${src.source_code}  \u00b7  ${src.brand}` : String(src.source_code),
    }));
}

// The supplier name that goes with a sid, so a rule carries all three fields
// without the operator typing the name.
export function supplierNameForSid(sid, suppliers = []) {
  const want = String(sid || '').trim().toLowerCase();
  if (!want) return '';
  const hit = (suppliers || []).find((s) => String(s?.sid || '').trim().toLowerCase() === want);
  return hit?.name || '';
}

// A route saved before sources existed pins only a supplier name. Map that
// onto the supplier-only option for that supplier so editing the route does
// not silently drop its pin, which would send its leads back to unattributed.
export function optionValueForSupplierName(supplierName, index) {
  const want = String(supplierName || '').trim().toLowerCase();
  if (!want || !index) return '';
  for (const [value, opt] of index.entries()) {
    if (opt.ssid) continue;
    if (String(opt.supplier_name || '').trim().toLowerCase() === want) return value;
  }
  return '';
}

// Human description of a stored pairing, used when it matches no known source.
export function describeStoredPairing(rule) {
  const sid = String(rule?.sid || '').trim();
  const ssid = String(rule?.ssid || '').trim();
  const name = String(rule?.supplier_name || '').trim();
  const parts = [];
  if (ssid) parts.push(ssid);
  if (sid) parts.push(`sid ${sid}`);
  if (name) parts.push(name);
  return parts.join(' · ');
}
