import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { callLLM } from './llmClient.generated.js';

// Ad Manager AI Analyst. The frontend sends a pre-aggregated summary of the
// current scope (platform, account or portfolio, reported vs verified metrics,
// per-campaign rows). We return a structured opportunity / risk / recommendation
// object rendered by the AI insight card. Uses OpenAI (OPENAI_API_KEY secret).
//
// This function is read-only. It never touches the lead pipeline, AdSpend rows,
// or any entity. It only reads the JSON summary posted by the caller.
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
    const summary = body.summary || {};
    const scope = (body.scope || 'the selected scope').toString();
    const periodLabel = (body.periodLabel || 'the selected period').toString();

    // Nothing synced yet: return a deterministic empty state instead of asking
    // the model to invent numbers it was not given.
    if (!summary || !summary.spend) {
      return Response.json({
        insights: {
          confidence: 0,
          opportunity: 'No ad spend has synced for this scope and period yet. Run a Meta sync, then the analyst will compare reported cost against verified sold revenue.',
          risk: 'Without synced spend there is no reported versus verified comparison to make.',
          recommendation: 'Check the Meta connection in Settings Integrations and confirm an AdSpendMapping exists for each ad account.',
          tags: [],
        },
      });
    }

    const system = `You are a paid-media analyst for Legenex, a US motor vehicle accident lead generation operator.
The platform reports cost per lead at the pixel event. The dashboard joins that spend to the Lead entity and the LeadByte sold result, producing a verified cost per qualified lead and a real ROAS that the ad platform cannot see.
Never invent a number. Only cite figures present in the JSON. If the data is thin, say so plainly.
Never use em dashes in your output.`;

    const prompt = `Analyze the ad performance data below for ${scope} over ${periodLabel}.

Return a single JSON object with exactly these keys:
{
  "confidence": integer 0 to 100 reflecting how much data supports the read,
  "opportunity": one paragraph, max 45 words, naming the specific account or campaign to move budget into and why, citing real figures,
  "risk": one paragraph, max 45 words, naming the specific account or campaign where the reported CPL and the verified CPL diverge most, citing both figures,
  "recommendation": one sentence, max 35 words, a concrete budget or pause action,
  "tags": array of 2 to 4 short labels, each 3 words or fewer, describing the themes you found
}

=== AD PERFORMANCE DATA (JSON) ===
${JSON.stringify(summary)}`;

    const answer = await callOpenAI({ prompt, system });

    let parsed;
    try {
      parsed = JSON.parse(answer);
    } catch {
      parsed = { confidence: 0, opportunity: String(answer || '').slice(0, 400), risk: '', recommendation: '', tags: [] };
    }

    return Response.json({ insights: parsed });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
