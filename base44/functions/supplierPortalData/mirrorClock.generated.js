// Backup mirror time correction, service-role side.
//
// This app mirrors the primary Legenex dashboard. Base44 stamps its own
// created_date on insert and will not accept one from the caller, so every
// mirrored row's created_date is "when the sync ran", not when the lead
// actually arrived. The sync job copies the primary's real timestamp into
// source_created_date; this wrapper puts it back where reporting code expects.
//
// Wrap a service-role client once at the top of a read-only function:
//
//   const svc = mirrorClock(base44.asServiceRole);
//
// From there svc.entities.X.list / .filter / .get behave exactly as before,
// except created_date in a sort string or filter query is redirected to
// source_created_date, and returned records carry the primary's created_date.
//
// Read paths only. create / update / delete pass straight through, but there
// is no reason to put this anywhere near the lead ingestion pipeline.
//
// Plain JS on purpose: the function bundler in this app only accepts relative
// .js imports, matching the other shared modules here.

const MIRROR_DATE = 'source_created_date';

const restoreRecord = (rec) => {
  if (!rec || typeof rec !== 'object' || !rec[MIRROR_DATE]) return rec;
  return { ...rec, created_date: rec[MIRROR_DATE] };
};

const restore = (result) => Array.isArray(result) ? result.map(restoreRecord) : restoreRecord(result);

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

const wrapEntity = (entity) => new Proxy(entity, {
  get(target, prop) {
    const value = target[prop];
    if (typeof value !== 'function') return value;
    if (prop === 'list') {
      return async (sort, ...rest) => restore(await value.apply(target, [rewriteSort(sort), ...rest]));
    }
    if (prop === 'filter') {
      return async (query, sort, ...rest) =>
        restore(await value.apply(target, [rewriteQuery(query), rewriteSort(sort), ...rest]));
    }
    if (prop === 'get') {
      return async (...args) => restore(await value.apply(target, args));
    }
    return value.bind(target);
  },
});

export function mirrorClock(serviceRole) {
  let entitiesProxy = null;
  return new Proxy(serviceRole, {
    get(target, prop) {
      if (prop !== 'entities') {
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      }
      if (!entitiesProxy) {
        entitiesProxy = new Proxy(target.entities, {
          get(entTarget, entityName) {
            const entity = entTarget[entityName];
            return (entity && typeof entity === 'object') ? wrapEntity(entity) : entity;
          },
        });
      }
      return entitiesProxy;
    },
  });
}
