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

// Base44 entity read methods (list, filter) can resolve to null when an entity
// has zero records, which crashes UI code that expects an array. Wrap the
// entities so those methods always resolve to an array. Every other property
// and method passes through untouched. This only affects the dashboard read
// layer and never touches backend functions or the lead pipeline.
const wrapEntity = (entity) => new Proxy(entity, {
  get(target, prop) {
    const value = target[prop];
    if (typeof value === 'function' && (prop === 'list' || prop === 'filter')) {
      return async (...args) => {
        const result = await value.apply(target, args);
        return Array.isArray(result) ? result : [];
      };
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
