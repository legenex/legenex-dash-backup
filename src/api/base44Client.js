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
// Backup mirror time correction
//
// This app is a mirror of the primary Legenex dashboard. Base44 stamps its own
// created_date whenever a record is inserted and will not accept one from the
// caller, so every mirrored row carries a created_date of "whenever the sync
// ran" rather than when the lead actually arrived. Left alone that makes every
// date filter in the dashboard wrong: This Month would show the entire history.
//
// The sync job copies the primary's real timestamp into source_created_date.
// This layer swaps it back in on the way out, and rewrites created_date in
// filters and sorts on the way in, so every page above it sees the same dates
// the primary app shows without any page needing to know about the mirror.
//
// Records with no source_created_date (anything created natively in this app)
// pass through untouched.
// ---------------------------------------------------------------------------

const MIRROR_DATE = 'source_created_date';

const restoreRecord = (rec) => {
  if (!rec || typeof rec !== 'object' || !rec[MIRROR_DATE]) return rec;
  return { ...rec, created_date: rec[MIRROR_DATE] };
};

const restore = (result) => {
  if (Array.isArray(result)) return result.map(restoreRecord);
  return restoreRecord(result);
};

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

// Base44 entity read methods (list, filter) can resolve to null when an entity
// has zero records, which crashes UI code that expects an array. Wrap the
// entities so those methods always resolve to an array, and apply the mirror
// time correction in the same place. Every other property and method passes
// through untouched. This only affects the dashboard read layer and never
// touches backend functions or the lead pipeline.
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

export const base44 = new Proxy(_client, {
  get(target, prop) {
    if (prop === 'entities') return entitiesProxy;
    return target[prop];
  },
});
