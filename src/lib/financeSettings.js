// Finance Settings: the mapping brain for the Finances section.
// Persists as JSON on IntegrationConfig(name='finance_settings'), mirroring the
// Mercury config pattern, so there is no new entity schema. Categories, matching
// rules, counterparty aliases, and accounts all live here and feed the Bank Feed
// category chips, the Resolve flow, and the expense-mapping drawer.
import { base44 } from '@/api/base44Client';

const CONFIG_NAME = 'finance_settings';

// Default taxonomy. Keys align with the CAT_STYLE map used in the Bank Feed.
// Each category carries a group (display bucket) and a cost_class that drives
// the Profitability tab. Existing keys are preserved so all readers keep working.
export const DEFAULT_CATEGORIES = [
  { id: 'cat_revenue', key: 'revenue', label: 'Revenue', group: 'Revenue', cost_class: 'revenue', keywords: ['cashback', 'legenex llc', 'deposit', 'interest payment'] },
  { id: 'cat_media', key: 'media', label: 'Ad Spend', group: 'Ad Spend', cost_class: 'variable', keywords: ['facebk', 'facebook', 'meta', 'google ads', 'tiktok', 'taboola'] },
  { id: 'cat_payouts', key: 'payouts', label: 'Supplier Payouts', group: 'Payouts', cost_class: 'variable', keywords: [] },
  { id: 'cat_tech', key: 'tech', label: 'Software Tools', group: 'Software', cost_class: 'fixed', keywords: ['openai', 'aws', 'google cloud', 'google*workspace', 'vercel', 'base44', 'slack', 'canva'] },
  { id: 'cat_staff', key: 'staff', label: 'Staff and Consultancy', group: 'Staff', cost_class: 'fixed', keywords: ['influxx', 'payroll', 'contractor', 'consult'] },
  { id: 'cat_fees', key: 'fees', label: 'Bank and Card Fees', group: 'Fees', cost_class: 'fixed', keywords: ['intl. transaction fee', 'transaction fee', 'wire fee'] },
  { id: 'cat_drawings', key: 'drawings', label: 'Owners Drawings', group: 'Drawings', cost_class: 'drawings', keywords: ['revolut', 'interactive brok', 'nicholas j allen'] },
  { id: 'cat_personal', key: 'personal', label: 'Personal', group: 'Drawings', cost_class: 'drawings', keywords: [] },
  { id: 'cat_transfers', key: 'transfers', label: 'Internal Transfers and Card Autopay', group: 'Transfers', cost_class: 'excluded', keywords: ['io autopay', 'send money transaction initiated on mercury', 'stripe payout', 'stripe; transfer'] },
  { id: 'cat_other', key: 'other', label: 'Other', group: 'Other', cost_class: 'fixed', keywords: [] },
];

// Cost classes that drive the Profitability tab. Each key groups categories
// into how they behave against lead volume and the breakeven line.
export const COST_CLASSES = [
  { key: 'revenue', label: 'Revenue', hint: 'Money in. Not a cost.' },
  { key: 'variable', label: 'Variable', hint: 'Scales with lead volume. Sits in contribution margin.' },
  { key: 'fixed', label: 'Fixed', hint: 'Recurs regardless of volume. Sets the breakeven bar.' },
  { key: 'drawings', label: 'Drawings', hint: 'Owner money out. Shown below the line, excluded from breakeven.' },
  { key: 'excluded', label: 'Excluded', hint: 'Internal transfer or card autopay. Would double count real cost.' },
];

export function emptySettings() {
  return { categories: DEFAULT_CATEGORIES, matchRules: [], counterparties: [], accounts: [] };
}

// Load the persisted finance settings, falling back to defaults.
export async function loadFinanceSettings() {
  const rec = (await base44.entities.IntegrationConfig.filter({ name: CONFIG_NAME }))[0] || null;
  if (!rec) return { id: null, settings: emptySettings() };
  let parsed = {};
  try { parsed = JSON.parse(rec.config || '{}'); } catch { parsed = {}; }
  // Backfill group and cost_class on any persisted category that predates them,
  // so settings saved before this change load without error.
  const defaultsByKey = new Map(DEFAULT_CATEGORIES.map(c => [c.key, c]));
  const rawCategories = parsed.categories?.length ? parsed.categories : DEFAULT_CATEGORIES;
  const categories = rawCategories.map(c => {
    if (c.cost_class && c.group) return c;
    const def = defaultsByKey.get(c.key);
    return {
      ...c,
      group: c.group || def?.group || 'Other',
      cost_class: c.cost_class || def?.cost_class || 'fixed',
    };
  });
  return {
    id: rec.id,
    settings: {
      categories,
      matchRules: parsed.matchRules || [],
      counterparties: parsed.counterparties || [],
      accounts: parsed.accounts || [],
    },
  };
}

// Resolve the cost_class for a category key. Empty or falsy key means the
// transaction is uncategorized and is treated as an internal transfer for
// profitability purposes (excluded). Unknown keys default to fixed.
export function costClassOf(categoryKey, settings) {
  if (!categoryKey) return 'excluded';
  const cat = (settings?.categories || []).find(c => c.key === categoryKey);
  return cat?.cost_class || 'fixed';
}

// Persist the whole settings object. Creates the row on first save.
export async function saveFinanceSettings(id, settings) {
  const payload = JSON.stringify(settings);
  if (id) return base44.entities.IntegrationConfig.update(id, { config: payload });
  return base44.entities.IntegrationConfig.create({ name: CONFIG_NAME, config: payload });
}

// Suggest a counterparty for a bank description using explicit rules first,
// then counterparty aliases, then a loose name match. Returns null if unsure.
export function suggestMatch(description, settings) {
  const desc = (description || '').toLowerCase();
  if (!desc || !settings) return null;

  for (const r of settings.matchRules || []) {
    const pat = (r.pattern || '').toLowerCase();
    if (pat && desc.includes(pat)) {
      return { entity_type: r.entity_type, entity_name: r.entity_name, reason: `rule "${r.pattern}"`, confidence: 0.95 };
    }
  }
  for (const c of settings.counterparties || []) {
    for (const alias of c.aliases || []) {
      const a = (alias || '').toLowerCase();
      if (a && desc.includes(a)) {
        return { entity_type: c.type, entity_name: c.name, reason: `alias "${alias}"`, confidence: 0.85 };
      }
    }
    if (c.name && desc.includes(c.name.toLowerCase())) {
      return { entity_type: c.type, entity_name: c.name, reason: 'name match', confidence: 0.7 };
    }
  }
  return null;
}

// Suggest a category for a description using category keywords.
export function suggestCategory(description, settings) {
  const desc = (description || '').toLowerCase();
  if (!desc || !settings) return null;
  for (const cat of settings.categories || []) {
    for (const kw of cat.keywords || []) {
      if (kw && desc.includes(kw.toLowerCase())) {
        return { key: cat.key, label: cat.label, reason: `keyword "${kw}"` };
      }
    }
  }
  return null;
}

let _id = 0;
export const newId = (prefix = 'fs') => `${prefix}_${Date.now().toString(36)}_${(_id++).toString(36)}`;