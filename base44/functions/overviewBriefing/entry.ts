import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { callLLM } from './llmClient.generated.js';

// AI Analyst briefing for the Overview command center.
// The frontend sends a pre-aggregated finance/lead summary (current + prior period);
// we return a short plain-English briefing. Uses OpenAI (OPENAI_API_KEY secret).
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
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const summary = body?.summary;
    if (!summary) return Response.json({ error: 'Missing summary' }, { status: 400 });

    const system = 'You are a sharp CFO-level financial analyst for a lead-generation business. You read a reconciliation summary where "booked" means recorded from leads and "verified" means proven by real cash received. Write tight, specific, plain-English briefings. No hype, no emojis, no markdown headings.';

    const prompt = `Write a 3-4 sentence executive briefing for the current period based on this data. Cover, in order: (1) what changed vs the prior period, (2) where the biggest money-booked-but-not-yet-proven gap is, (3) which counterparty or campaign is the top risk, (4) the single most important action to take now. Be concrete with the dollar figures given. Keep it under 90 words.

DATA (JSON):
${JSON.stringify(summary)}`;

    const briefing = await callOpenAI({ prompt, system });
    return Response.json({ briefing: String(briefing || '').trim() });
  } catch (error) {
    // Deliberately 200: a non-2xx makes the SDK throw on the client, which
    // replaced the real cause with a generic "could not generate" message and
    // left the operator with nothing to act on.
    return Response.json({ error: (error as Error).message }, { status: 200 });
  }
});