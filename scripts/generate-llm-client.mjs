// Generates the per-function copies of the canonical LLM client from
// base44/functions/_shared/llmClient.js.
// Run: node scripts/generate-llm-client.mjs
//
// Same mechanism as generate-backend-engine.mjs and generate-lead-identity.mjs:
// the Base44 function bundler cannot resolve a relative import outside a
// function's own folder, so each consuming function gets an identical generated
// copy alongside its entry.ts. These copies are generated artifacts only.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const LLM_SOURCE = 'base44/functions/_shared/llmClient.js';

// Every function that talks to an LLM. Add here when a new one is written.
export const LLM_CONSUMER_DIRS = [
  'base44/functions/overviewBriefing',
  'base44/functions/dataBot',
  'base44/functions/adManagerInsights',
  'base44/functions/distributionInsights',
  'base44/functions/reconInsights',
  'base44/functions/categorizeTransactions',
  'base44/functions/walkthroughGuide',
  'base44/functions/whatsNew',
  'base44/functions/progressPrompt',
  'base44/functions/buyerFeedbackWebhook',
  'base44/functions/aiHealth',
];

export const llmClientPath = (dir) => `${dir}/llmClient.generated.js`;

export function generateLlmClient() {
  const code = readFileSync(LLM_SOURCE, 'utf8');
  if (/^\s*import\s/m.test(code)) {
    throw new Error(
      `${LLM_SOURCE} must have no imports so it can be copied verbatim into a function folder.`,
    );
  }
  const hash = createHash('sha256').update(code).digest('hex');
  const header =
    '// GENERATED FILE - DO NOT EDIT BY HAND.\n' +
    `// Source of truth: ${LLM_SOURCE}\n` +
    '// Regenerate: node scripts/generate-llm-client.mjs\n' +
    `// canonical-llm-sha256: ${hash}\n`;
  return { code, hash, content: header + code };
}

function main() {
  const { content, hash } = generateLlmClient();
  let wrote = 0;
  for (const dir of LLM_CONSUMER_DIRS) {
    if (!existsSync(dir)) {
      console.warn(`skipped (no such function dir): ${dir}`);
      continue;
    }
    writeFileSync(llmClientPath(dir), content);
    console.log(`wrote ${llmClientPath(dir)}`);
    wrote += 1;
  }
  console.log(`canonical-llm-sha256: ${hash} (${wrote} copies)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
