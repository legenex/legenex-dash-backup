// Shared helpers for the nested AND/OR condition group shape used by connector
// filter_conditions. The backend evaluator in processLead already understands
// this shape; these helpers let the UI read legacy flat records and write the
// new group shape back.

export const OPERATOR_OPTIONS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is blank' },
  { value: 'is_not_empty', label: 'is not blank' },
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
];

export const VALUE_LESS_OPS = ['is_empty', 'is_not_empty'];

function emptyRoot() {
  return { type: 'group', match: 'all', name: '', children: [] };
}

// Accepts a JSON string, array, object, null, or undefined and returns a group
// tree. Legacy flat arrays become an all-match group so saved records open
// correctly and are written back in the new shape on the next save.
export function normalizeConditionTree(raw) {
  if (!raw) return emptyRoot();
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); }
    catch { return emptyRoot(); }
  }
  if (Array.isArray(parsed)) {
    return {
      type: 'group',
      match: 'all',
      name: '',
      children: parsed.map((c) => ({
        type: 'condition',
        field: c.field || '',
        operator: c.operator || 'equals',
        value: c.value ?? '',
      })),
    };
  }
  if (parsed && typeof parsed === 'object' && parsed.type === 'group') {
    return parsed;
  }
  return emptyRoot();
}

export function serializeConditionTree(tree) {
  return JSON.stringify(tree);
}

// Recursively count leaf condition nodes.
export function countConditions(tree) {
  if (!tree || typeof tree !== 'object') return 0;
  if (tree.type === 'condition') return 1;
  const children = Array.isArray(tree.children) ? tree.children : [];
  return children.reduce((sum, c) => sum + countConditions(c), 0);
}

// Recursively collect leaf condition nodes in document order.
export function flattenConditions(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (tree.type === 'condition') return [tree];
  const children = Array.isArray(tree.children) ? tree.children : [];
  return children.flatMap((c) => flattenConditions(c));
}

// Deep copy a node.
export function cloneNode(node) {
  if (typeof structuredClone === 'function') return structuredClone(node);
  return JSON.parse(JSON.stringify(node));
}