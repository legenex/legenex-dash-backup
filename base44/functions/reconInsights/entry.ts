import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { callLLM } from './llmClient.generated.js';

// Produces AI reconciliation insights over per-counterparty gaps. Admin-only.
// Uses OpenAI (OPENAI_API_KEY secret).
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

    const body = await req.json().catch(() => ({}));
    const gaps = body.gaps || [];
    if (!Array.isArray(gaps) || gaps.length === 0) {
      return Response.json({ insights: 'No open reconciliation gaps to analyze.' });
    }

    const summary = gaps.slice(0, 40).map((g: any) =>
      `${g.name} (${g.type}): expected ${g.expected}, paid ${g.paid}, short ${g.short}`
    ).join('\n');

    const result = await callOpenAI({
      prompt: `You are a finance ops analyst for a lead-gen business. Given open reconciliation gaps between what counterparties owe/were owed (expected) and what was actually paid, give a short, punchy set of insights (max 5 bullet points). Focus on biggest risks, patterns, and what to chase first. Be concrete.

Open gaps:
${summary}`,
    });

    return Response.json({ insights: String(result || '') });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});