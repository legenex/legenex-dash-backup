// Canonical LLM client with provider failover.
//
// Every AI feature in this app calls this. It tries OpenAI first, and if OpenAI
// is unavailable for ANY reason (secret missing, key revoked, quota exhausted,
// model retired, network or 5xx) it transparently falls back to Anthropic.
// The caller does not care which provider served it.
//
// This matters because OpenAI credits running out took out every AI feature in
// the app at once, and the UI reported it as a generic failure.
//
// Supports the full surface the callers actually use: system prompts, images
// (DataBot screenshots), and JSON-schema structured output.
//
// Lives under base44/functions/_shared deliberately, NOT src/lib: it references
// Deno globals and would trip the frontend lint config. It has ZERO imports so
// scripts/generate-llm-client.mjs can copy it verbatim into each function
// folder. Do not add an import here.

const MODEL_FALLBACK = {
  'gpt-4o-mini': 'claude-haiku-4-5-20251001',
  'gpt-4o': 'claude-sonnet-5',
};
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

function providerError(provider, code, detail) {
  const err = new Error(`${provider.toUpperCase()}_${code}: ${detail}`);
  err.provider = provider;
  err.code = code;
  return err;
}

// At most 4 images, matching the previous DataBot behaviour.
function usableImages(images) {
  return Array.isArray(images) ? images.filter((i) => i && i.data).slice(0, 4) : [];
}

function classify(provider, status, detail, model) {
  if (status === 401) return providerError(provider, 'KEY_REJECTED', detail);
  if (status === 429) return providerError(provider, 'QUOTA', detail);
  if (status === 404) return providerError(provider, 'MODEL_MISSING', `model "${model}" unavailable. ${detail}`);
  return providerError(provider, `HTTP_${status}`, detail);
}

async function callOpenAIProvider({ prompt, system, model, temperature, jsonSchema, images, maxTokens }) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw providerError('openai', 'KEY_MISSING', 'OPENAI_API_KEY is not set on this app.');

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });

  const pics = usableImages(images);
  if (pics.length) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        ...pics.map((i) => ({
          type: 'image_url',
          image_url: { url: `data:${i.media_type || 'image/png'};base64,${i.data}`, detail: 'high' },
        })),
      ],
    });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  const payload = { model, messages, temperature };
  if (maxTokens) payload.max_tokens = maxTokens;
  if (jsonSchema) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: { name: 'response', strict: false, schema: jsonSchema },
    };
  }

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw providerError('openai', 'NETWORK', e.message);
  }
  if (!res.ok) throw classify('openai', res.status, (await res.text()).slice(0, 300), model);

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

async function callAnthropicProvider({ prompt, system, model, temperature, jsonSchema, images, maxTokens }) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw providerError('anthropic', 'KEY_MISSING', 'ANTHROPIC_API_KEY is not set on this app.');

  const anthropicModel = MODEL_FALLBACK[model] || DEFAULT_ANTHROPIC_MODEL;

  // Anthropic has no response_format flag, so structured output is instructed
  // and the fences are stripped from the result below.
  let sys = system || '';
  if (jsonSchema) {
    sys = `${sys ? `${sys}\n\n` : ''}Respond with a single valid JSON object matching this JSON Schema, and nothing else. No prose, no markdown fences.\n\n${JSON.stringify(jsonSchema)}`;
  }

  const pics = usableImages(images);
  const content = pics.length
    ? [
        ...pics.map((i) => ({
          type: 'image',
          source: { type: 'base64', media_type: i.media_type || 'image/png', data: i.data },
        })),
        { type: 'text', text: prompt },
      ]
    : prompt;

  const body = {
    model: anthropicModel,
    // Required by Anthropic, unlike OpenAI where it is optional.
    max_tokens: maxTokens || 4096,
    messages: [{ role: 'user', content }],
  };
  if (sys) body.system = sys;
  if (typeof temperature === 'number') body.temperature = temperature;

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw providerError('anthropic', 'NETWORK', e.message);
  }
  if (!res.ok) throw classify('anthropic', res.status, (await res.text()).slice(0, 300), anthropicModel);

  const data = await res.json();
  const text = (data?.content || [])
    .filter((b) => b?.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return jsonSchema
    ? text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    : text;
}

// Text plus which provider served it and why any failover happened.
export async function callLLMDetailed({
  prompt,
  system,
  model = 'gpt-4o-mini',
  temperature = 0.4,
  jsonSchema = null,
  images = [],
  maxTokens,
} = {}) {
  const args = { prompt, system, model, temperature, jsonSchema, images, maxTokens };

  let openaiError = null;
  try {
    return { text: await callOpenAIProvider(args), provider: 'openai', model, failover: false, openai_error: null };
  } catch (e) {
    openaiError = e;
  }

  try {
    return {
      text: await callAnthropicProvider(args),
      provider: 'anthropic',
      model: MODEL_FALLBACK[model] || DEFAULT_ANTHROPIC_MODEL,
      failover: true,
      openai_error: openaiError.message,
    };
  } catch (anthropicError) {
    // Report BOTH causes. Reporting only the second sends the operator to fix
    // the wrong provider.
    throw new Error(
      `ALL_PROVIDERS_FAILED. OpenAI: ${openaiError.message} | Anthropic: ${anthropicError.message}`,
    );
  }
}

// Drop-in replacement for the old per-function callOpenAI. Returns a string,
// or a parsed object when jsonSchema is supplied (matching the old DataBot
// contract, which callers rely on).
export async function callLLM(args) {
  const { text } = await callLLMDetailed(args);
  if (args && args.jsonSchema) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}
