import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
const _client = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// ---------------------------------------------------------------------------
// Backup mirror behaviour
//
// This app is a read-only mirror of the primary Legenex dashboard. It holds a
// copy of the primary's data, kept 1:1 by the `mirrorSyncV3` backend function.
// Three things have to be true for that to work, and all three are handled
// here so no page has to know it is running against the mirror.
//
// 1. Time correction. Base44 stamps its own created_date on insert and will
//    not accept one from the caller, so every mirrored row's created_date is
//    "when the sync ran", not when the record was really created. The sync
//    copies the primary's timestamp into source_created_date; this layer swaps
//    it back in on read and redirects created_date in filters and sorts.
//
// 2. Server-side reads. Aggregation happens inside backend functions, which
//    hit the database directly and need the same correction. Those exist as
//    mirror-aware copies suffixed V3, and calls are redirected to them.
//    (They had to ship under new names: this platform does not redeploy an
//    edited function file, only a newly created one.)
//
// 3. No writing. The app is a full clone with live credentials, so left alone
//    it will sync ad spend, recompute state, and email real buyers the moment
//    someone clicks around in it. Anything that writes data or sends a message
//    is blocked below.
// ---------------------------------------------------------------------------

const MIRROR_DATE = 'source_created_date';

const restoreRecord = (rec) => {
  if (!rec || typeof rec !== 'object' || !rec[MIRROR_DATE]) return rec;
  return { ...rec, created_date: rec[MIRROR_DATE] };
};

const restore = (result) => Array.isArray(result) ? result.map(restoreRecord) : restoreRecord(result);

// '-created_date' -> '-source_created_date'
const rewriteSort = (sort) => {
  if (typeof sort !== 'string' || !sort.includes('created_date')) return sort;
  return sort.replace(/created_date/g, MIRROR_DATE);
};

// Rewrite created_date keys anywhere in a Mongo-style filter, including inside
// $and / $or / $nor arrays.
const rewriteQuery = (query) => {
  if (Array.isArray(query)) return query.map(rewriteQuery);
  if (!query || typeof query !== 'object') return query;
  const out = {};
  for (const [key, value] of Object.entries(query)) {
    const nextKey = key === 'created_date' ? MIRROR_DATE : key;
    out[nextKey] = (value && typeof value === 'object') ? rewriteQuery(value) : value;
  }
  return out;
};

// Read functions that aggregate server-side, redirected to their mirror-aware
// copies so their date filtering lands on source_created_date.
const MIRROR_FUNCTIONS = {
  operationsData: 'operationsDataV3',
  operatorData: 'operatorDataV3',
  portalData: 'portalDataV3',
  supplierPortalData: 'supplierPortalDataV3',
  generateBillingRun: 'generateBillingRunV3',
  dataBot: 'dataBotV3',
  metaSyncHistory: 'metaSyncHistoryV3',
  progressReadiness: 'progressReadinessV3',
  listUsers: 'listUsersV3',
  contract: 'contractV3',
};

// Functions that create or mutate records, or send something to a real person
// or endpoint. Blocked outright in the mirror.
//
// syncMetaSpend is the important one: useMetaAutoSync and the Overview refresh
// both fire it, which was quietly generating AdSpend and MetaSyncRun rows here
// that the next sync pass then had to delete again.
//
// The sends matter more than the churn. campaignDeliveryTest posts to real
// buyer endpoints and the send* functions email and message real people. A
// backup is not a sandbox; it holds the same credentials as production.
const BLOCKED_FUNCTIONS = new Set([
  // data writers
  'syncMetaSpend', 'syncGoogleSheets', 'syncMercury', 'syncStripe',
  'recomputeStateStatus', 'nightlyStateStatusRecompute', 'auditRun', 'progressSync',
  'backfillLeadType', 'dedupeLeads', 'purgeSeedLeads', 'bulkDeleteLeads',
  'renameField', 'recoverTrustedForm', 'pullCallLogs',
  // record creation / provisioning
  'allocateBuyerCode', 'onboardBuyer', 'submitBuyerOnboarding', 'provisionLeadSource',
  'recordInvitation', 'cancelInvitation', 'mintOnboardingLink', 'portalAction',
  // anything that leaves the building
  'sendGmail', 'sendOnboardingLink', 'sendSlackTest', 'sendWhatsapp',
  'sendOutboundWebhook', 'sendPayloadTest', 'campaignDeliveryTest',
]);

const blockedResult = (name) => ({
  data: {
    ok: false,
    skipped: true,
    mirror: true,
    error: `"${name}" is disabled in the backup mirror. Run it in the primary dashboard.`,
  },
});

// Base44 entity read methods (list, filter) can resolve to null when an entity
// has zero records, which crashes UI code that expects an array. Wrap the
// entities so those methods always resolve to an array, and apply the mirror
// time correction in the same place. Every other property and method passes
// through untouched.
const wrapEntity = (entity) => new Proxy(entity, {
  get(target, prop) {
    const value = target[prop];
    if (typeof value !== 'function') return value;

    if (prop === 'list') {
      return async (sort, ...rest) => {
        const result = await value.apply(target, [rewriteSort(sort), ...rest]);
        return Array.isArray(result) ? restore(result) : [];
      };
    }

    if (prop === 'filter') {
      return async (query, sort, ...rest) => {
        const result = await value.apply(target, [rewriteQuery(query), rewriteSort(sort), ...rest]);
        return Array.isArray(result) ? restore(result) : [];
      };
    }

    if (prop === 'get') {
      return async (...args) => restore(await value.apply(target, args));
    }

    return value;
  },
});

const entitiesProxy = new Proxy(_client.entities, {
  get(target, entityName) {
    const entity = target[entityName];
    if (entity && typeof entity === 'object') return wrapEntity(entity);
    return entity;
  },
});

const functionsProxy = new Proxy(_client.functions, {
  get(target, prop) {
    const value = target[prop];
    if (prop !== 'invoke' || typeof value !== 'function') return value;
    return (name, ...rest) => {
      if (BLOCKED_FUNCTIONS.has(name)) {
        console.warn(`[mirror] blocked backend function "${name}"`);
        return Promise.resolve(blockedResult(name));
      }
      return value.apply(target, [MIRROR_FUNCTIONS[name] || name, ...rest]);
    };
  },
});

export const base44 = new Proxy(_client, {
  get(target, prop) {
    if (prop === 'entities') return entitiesProxy;
    if (prop === 'functions') return functionsProxy;
    return target[prop];
  },
});
