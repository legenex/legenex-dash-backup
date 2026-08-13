import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { callLLM } from './llmClient.generated.js';

// Generates the "What's New" release highlights using OpenAI (OPENAI_API_KEY secret).
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

    const changelog = `Recent changes to Legenex DashFlo:
- Added a Lead Distribution sub-sidebar to move quickly between Dashboard, Campaigns, Deliveries and Conversion Events.
- Added a profile menu at the bottom of the sidebar with a theme switcher (System / Light / Dark), settings and help links.
- Added an AI-guided Walk Through that helps set up the platform step by step.
- Added a new Profile settings page to edit name, email, timezone and Gmail connection.
- All AI features (DataBot, AI insights, walkthrough, this page) now run on OpenAI.`;

    const release = await callOpenAI({
      system: 'You write concise, upbeat product release notes for a SaaS lead-distribution platform. Focus on the user benefit of each change. No hype, no emojis.',
      prompt: `Turn the changelog below into a single release named "v1.0.0" with 4-6 short bullet points (max ~16 words each). Return strict JSON with keys version, date, items (array of strings).

${changelog}`,
      jsonSchema: {
        type: 'object',
        properties: {
          version: { type: 'string' },
          date: { type: 'string' },
          items: { type: 'array', items: { type: 'string' } },
        },
      },
    });

    if (!release || !Array.isArray(release.items)) {
      return Response.json({ error: 'Could not generate release notes' }, { status: 502 });
    }
    return Response.json({ release });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});