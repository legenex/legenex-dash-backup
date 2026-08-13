import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { callLLM } from './llmClient.generated.js';

// AI-categorizes uncategorized BankTransaction records. The taxonomy is read
// from the finance_settings IntegrationConfig so it stays in sync with the
// user-editable categories in Finances > Settings. Falls back to the original
// six categories when no settings record exists.
// Uses OpenAI (OPENAI_API_KEY secret). Admin-only.

// Used only when no finance_settings record exists, parsing fails, or the
// categories array is empty. Matches the original hardcoded behavior.
const FALLBACK_CATEGORIES = [
  { key: 'tech', label: 'Software Tools', hint: 'software, SaaS, hosting, APIs, tools' },
  { key: 'media', label: 'Ad Spend', hint: 'ad spend, marketing, agencies, creative' },
  { key: 'personal', label: 'Personal', hint: 'owner personal expenses, non-business' },
  { key: 'payouts', label: 'Supplier Payouts', hint: 'paying suppliers / affiliates' },
  { key: 'revenue', label: 'Revenue', hint: 'money received from buyers / clients (positive amounts)' },
  { key: 'other', label: 'Other', hint: 'anything else' },
];
// Delegates to the shared client: OpenAI first, automatic failover to
// Anthropic (ANTHROPIC_API_KEY) if OpenAI is unavailable for any reason.
// The name is kept so existing call sites are untouched.
async function callOpenAI({ prompt, system, model = 'gpt-4o-mini', temperature = 0.4, maxTokens } = {}) {
  return await callLLM({ prompt, system, model, temperature, maxTokens });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;

    // Resolve the taxonomy from finance_settings, falling back to the six
    // original categories. Each resolved category exposes key, label and a
    // hint derived from its keywords.
    let resolved = FALLBACK_CATEGORIES;
    const cfg = (await svc.entities.IntegrationConfig.filter({ name: 'finance_settings' }))[0] || null;
    if (cfg) {
      try {
        const parsed = JSON.parse(cfg.config || '{}');
        if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
          resolved = parsed.categories.map((c: any) => ({
            key: c.key,
            label: c.label || c.key,
            hint: Array.isArray(c.keywords) && c.keywords.length ? c.keywords.join(', ') : (c.label || c.key),
          }));
        }
      } catch { /* keep FALLBACK_CATEGORIES */ }
    }
    const resolvedKeys = resolved.map((c) => c.key);
    const keySet = new Set(resolvedKeys);

    const all = await svc.entities.BankTransaction.list('-date', 500);
    const uncategorized = all.filter((t: any) => !t.category);

    let updated = 0;
    if (uncategorized.length > 0) {
      // Batch to keep the prompt small.
      const batch = uncategorized.slice(0, 100);
      const list = batch.map((t: any, i: number) => `${i}. ${t.description || '(no description)'} | amount ${t.amount}`).join('\n');
      const categoryLines = resolved.map((c) => `- ${c.key} (${c.label}): ${c.hint}`).join('\n');
      const result = await callOpenAI({
        prompt: `You are a bookkeeping assistant for a lead-generation business. Categorize each bank transaction into exactly one of: ${resolvedKeys.join(', ')}.
${categoryLines}

Transactions:
${list}

Return JSON with an array "items" of { index, category }.`,
        jsonSchema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'object', properties: { index: { type: 'number' }, category: { type: 'string' } } },
            },
          },
        },
      });
      const items = result?.items || [];
      for (const it of items) {
        const t = batch[it.index];
        if (t && keySet.has(it.category)) {
          await svc.entities.BankTransaction.update(t.id, { category: it.category, ai_categorized: true });
          updated++;
        }
      }
    }

    // Summary stats.
    const refreshed = await svc.entities.BankTransaction.list('-date', 500);
    const moneyIn = refreshed.filter((t: any) => t.amount > 0).reduce((a: number, t: any) => a + Number(t.amount), 0);
    const moneyOut = refreshed.filter((t: any) => t.amount < 0).reduce((a: number, t: any) => a + Number(t.amount), 0);
    const byCat: Record<string, number> = {};
    for (const t of refreshed) { const c = t.category || 'uncategorized'; byCat[c] = (byCat[c] || 0) + Number(t.amount); }

    return Response.json({ success: true, updated, money_in: moneyIn, money_out: moneyOut, by_category: byCat, categories_used: resolvedKeys });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});