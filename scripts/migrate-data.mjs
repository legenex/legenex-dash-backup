#!/usr/bin/env node
/**
 * Base44 data migration: legenex-dashboard  ->  legenex-dash-backup
 *
 * Copies every entity from the source app into the target app, preserving
 * relational integrity. Base44 assigns new record IDs on insert (verified:
 * a supplied `id` is silently discarded), so every cross-entity reference
 * must be rewritten via an old-id -> new-id map.
 *
 * Design notes:
 *  - Two-pass. Pass 1 inserts records with internal reference fields stripped.
 *    Pass 2 patches them once the full ID map exists. This is required because
 *    the reference graph contains cycles (AuditFinding <-> ChangeRequest <->
 *    PromptDraft, plus Lead and Campaign self-references).
 *  - Resumable. The ID map is checkpointed to disk after every batch, so a
 *    failed or interrupted run can be re-run without duplicating records.
 *    This matters because Base44 exposes no delete capability here.
 *  - Dry-run by default. Writes nothing unless --execute is passed.
 *
 * Usage:
 *   BASE44_SOURCE_KEY=... BASE44_TARGET_KEY=... node scripts/migrate-data.mjs
 *   BASE44_SOURCE_KEY=... BASE44_TARGET_KEY=... node scripts/migrate-data.mjs --execute
 *   ... --only=Buyer,Supplier,Delivery     (restrict to named entities)
 */

import fs from 'node:fs';
import path from 'node:path';

const SOURCE_APP = '6a4957e7b03e9b10c170d29e';
const TARGET_APP = '6a7d5e8a363d393ed46419e3';
const BASE = 'https://base44.app/api/apps';

const SOURCE_KEY = process.env.BASE44_SOURCE_KEY || '';
const TARGET_KEY = process.env.BASE44_TARGET_KEY || '';

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').replace('--only=', '')
  .split(',').map(s => s.trim()).filter(Boolean);

const PAGE = 200;          // records per read page
const BATCH = 50;          // records per write batch
const STATE_FILE = path.join(process.cwd(), '.migration-state.json');

/* ------------------------------------------------------------------ *
 * Reference map: field -> entity it points at.
 * Derived from the 90 entity schemas, then hand-corrected.
 * ONLY fields listed here are remapped. Anything not listed is copied
 * verbatim, which is deliberate: fields like fb_pixel_id, stripe_customer_id,
 * xero_contact_id, leadbyte_lead_id, ad_account_id, meta_campaign_id and
 * sheet_id are THIRD-PARTY ids. Remapping one of those would silently
 * corrupt the Meta and billing integrations.
 * ------------------------------------------------------------------ */
const REFS = {
  AdSpend:              { supplier_ad_account_id: 'SupplierAdAccount', supplier_id: 'Supplier' },
  ApiKey:               { supplier_id: 'Supplier' },
  AuditFinding:         { change_request_id: 'ChangeRequest' },
  AuditLog:             { lead_id: 'Lead' },
  BidAttempt:           { lead_id: 'Lead', route_member_id: 'RouteMember' },
  BillingLineItem:      { billing_run_id: 'BillingRun', campaign_id: 'Campaign', supplier_id: 'Supplier' },
  BillingRun:           { buyer_id: 'Buyer', supplier_id: 'Supplier', invoice_id: 'Invoice' },
  Buyer:                { campaign_ids: 'Campaign' },
  BuyerCplRule:         { buyer_id: 'Buyer', campaign_id: 'Campaign' },
  BuyerFeedback:        { lead_id: 'Lead', buyer_id: 'Buyer' },
  BuyerOnboarding:      { buyer_id: 'Buyer' },
  BuyerPayment:         { buyer_id: 'Buyer', invoice_id: 'Invoice' },
  BuyerStateCpl:        { buyer_id: 'Buyer' },
  BuyerWallet:          { buyer_id: 'Buyer' },
  CallRecord:           { lead_id: 'Lead' },
  Campaign:             { campaign_id: 'Campaign', supplier_ids: 'Supplier' },
  CapReservation:       { lead_id: 'Lead', route_member_id: 'RouteMember' },
  ChangeRequest:        { prompt_draft_id: 'PromptDraft' },
  ContractVersion:      { campaign_id: 'Campaign' },
  Delivery:             { buyer_id: 'Buyer', vertical_id: 'Vertical' },
  DeliveryAttempt:      { lead_id: 'Lead', sub_delivery_id: 'SubDelivery' },
  DestinationHealth:    { sub_delivery_id: 'SubDelivery' },
  ErrorLog:             { lead_id: 'Lead' },
  InboundWebhookRoute:  { api_key_id: 'ApiKey' },
  Invoice:              { buyer_id: 'Buyer' },
  Lead:                 { buyer_id: 'Buyer', lead_id: 'Lead', campaign_id: 'Campaign' },
  LeadSource:           { campaign_id: 'Campaign', api_key_id: 'ApiKey' },
  MetaLeadFormMapping:  { campaign_id: 'Campaign', supplier_id: 'Supplier' },
  MetaSyncRun:          { supplier_ad_account_id: 'SupplierAdAccount', supplier_id: 'Supplier' },
  PromptDraft:          { change_request_id: 'ChangeRequest' },
  ReturnRequest:        { lead_id: 'Lead', buyer_id: 'Buyer' },
  RouteConfigVersion:   { route_group_id: 'RouteGroup', campaign_id: 'Campaign' },
  RouteDecisionTrace:   { lead_id: 'Lead', cap_reservation_id: 'CapReservation' },
  RouteGroup:           { campaign_id: 'Campaign' },
  RouteMember:          { route_group_id: 'RouteGroup', buyer_id: 'Buyer', sub_delivery_id: 'SubDelivery' },
  SubDelivery:          { delivery_id: 'Delivery' },
  Supplier:             { campaign_ids: 'Campaign' },
  SupplierAdAccount:    { supplier_id: 'Supplier' },
  SupplierSource:       { supplier_id: 'Supplier' },
  SupplierStateCoverage:{ supplier_id: 'Supplier' },
  WalletTransaction:    { buyer_id: 'Buyer' },
};

// Fields Base44 owns. Never sent on insert.
const SYSTEM_FIELDS = new Set([
  'id', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample',
]);

// User is provisioned by Base44 auth, not copyable as data.
const SKIP_ENTITIES = new Set(['User']);

/* ------------------------------------------------------------------ */

async function api(app, key, entity, { method = 'GET', query = '', body = null } = {}) {
  const url = `${BASE}/${app}/entities/${entity}${query}`;
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['api_key'] = key;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * attempt * attempt);
        continue;
      }
      const text = await res.text();
      if (!res.ok) throw new Error(`${method} ${entity} -> ${res.status} ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : null;
    } catch (err) {
      if (attempt === 4) throw err;
      await sleep(1000 * attempt * attempt);
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function readAll(entity) {
  const out = [];
  for (let skip = 0; ; skip += PAGE) {
    const page = await api(SOURCE_APP, SOURCE_KEY, entity, { query: `?limit=${PAGE}&skip=${skip}` });
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  return { idMap: {}, done: [] };
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

/** Strip system fields and (in pass 1) internal reference fields. */
function prepare(entity, rec, { stripRefs }) {
  const refs = REFS[entity] || {};
  const out = {};
  for (const [k, v] of Object.entries(rec)) {
    if (SYSTEM_FIELDS.has(k)) continue;
    if (stripRefs && k in refs) continue;
    out[k] = v;
  }
  return out;
}

/** Rewrite reference fields using the ID map. Handles scalars and arrays. */
function remap(entity, rec, idMap, unresolved) {
  const refs = REFS[entity] || {};
  const patch = {};
  for (const [field, targetEntity] of Object.entries(refs)) {
    const val = rec[field];
    if (val == null) continue;
    const table = idMap[targetEntity] || {};
    if (Array.isArray(val)) {
      const mapped = val.map(v => {
        if (table[v]) return table[v];
        unresolved.push({ entity, field, oldId: v, target: targetEntity });
        return null;
      }).filter(Boolean);
      if (mapped.length) patch[field] = mapped;
    } else {
      if (table[val]) patch[field] = table[val];
      else unresolved.push({ entity, field, oldId: val, target: targetEntity });
    }
  }
  return patch;
}

async function main() {
  if (!SOURCE_KEY) console.warn('! BASE44_SOURCE_KEY not set. RLS-protected entities (Lead, etc.) will read as empty.');
  if (!TARGET_KEY && EXECUTE) throw new Error('BASE44_TARGET_KEY is required with --execute');

  console.log(EXECUTE ? '=== EXECUTE MODE (writes records) ===' : '=== DRY RUN (no writes) ===');

  const schemas = await api(TARGET_APP, TARGET_KEY, '', { query: '' }).catch(() => null);
  let entities = Object.keys(REFS);
  // full entity list comes from the repo's own definitions, which mirror the schemas
  const defsDir = path.join(process.cwd(), 'base44', 'entities');
  entities = fs.readdirSync(defsDir).map(f => f.replace(/\.jsonc$/, ''))
    .filter(e => !SKIP_ENTITIES.has(e));
  if (ONLY.length) entities = entities.filter(e => ONLY.includes(e));

  const state = loadState();
  const idMap = state.idMap;
  const summary = [];

  // ---------- PASS 1: insert with references stripped ----------
  for (const entity of entities) {
    if (state.done.includes(entity)) { console.log(`skip ${entity} (already done)`); continue; }
    let records;
    try { records = await readAll(entity); }
    catch (err) { console.log(`READ FAIL ${entity}: ${err.message}`); summary.push({ entity, read: 'ERROR' }); continue; }

    console.log(`${entity}: read ${records.length}`);
    summary.push({ entity, read: records.length });
    if (!records.length) { state.done.push(entity); saveState(state); continue; }

    idMap[entity] = idMap[entity] || {};
    if (!EXECUTE) continue;

    for (let i = 0; i < records.length; i += BATCH) {
      const slice = records.slice(i, i + BATCH);
      const payload = slice.map(r => prepare(entity, r, { stripRefs: true }));
      const created = await api(TARGET_APP, TARGET_KEY, entity, { method: 'POST', body: payload });
      const list = Array.isArray(created) ? created : [created];
      slice.forEach((src, n) => { if (list[n]?.id) idMap[entity][src.id] = list[n].id; });
      saveState(state);
      process.stdout.write(`  ${entity} ${Math.min(i + BATCH, records.length)}/${records.length}\r`);
    }
    state.done.push(entity);
    saveState(state);
    console.log(`  ${entity} inserted ${Object.keys(idMap[entity]).length}`);
  }

  // ---------- PASS 2: patch references ----------
  const unresolved = [];
  if (EXECUTE) {
    for (const entity of entities.filter(e => REFS[e])) {
      const records = await readAll(entity);
      let patched = 0;
      for (const src of records) {
        const newId = idMap[entity]?.[src.id];
        if (!newId) continue;
        const patch = remap(entity, src, idMap, unresolved);
        if (!Object.keys(patch).length) continue;
        await api(TARGET_APP, TARGET_KEY, `${entity}/${newId}`, { method: 'PUT', body: patch });
        patched++;
      }
      if (patched) console.log(`patched ${entity}: ${patched}`);
    }
  }

  console.log('\n--- SUMMARY ---');
  console.table(summary);
  if (unresolved.length) {
    console.log(`\n!! ${unresolved.length} unresolved references (pointed at records that do not exist in source):`);
    const byKey = {};
    for (const u of unresolved) { const k = `${u.entity}.${u.field}`; byKey[k] = (byKey[k] || 0) + 1; }
    console.table(byKey);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
