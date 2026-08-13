// Generates the per-function copy of the canonical outbound payload module
// from src/lib/outboundPayload.js.
// Run: node scripts/generate-outbound-payload.mjs
//
// Same mechanism as generate-supplier-rules.mjs. The reason it matters here is
// specific: the builder UI shows the operator a live preview of the body, and
// the dispatcher builds the body it actually sends. Those must be the same code,
// or an operator signs off on a payload that is not the one that leaves.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const OUTBOUND_SOURCE = 'src/lib/outboundPayload.js';

export const OUTBOUND_CONSUMER_DIRS = [
  'base44/functions/sendOutboundWebhook',
];

export const outboundPath = (dir) => `${dir}/outboundPayload.generated.js`;

export function generateOutboundPayload() {
  const code = readFileSync(OUTBOUND_SOURCE, 'utf8');
  if (/^\s*import\s/m.test(code)) {
    throw new Error(
      `${OUTBOUND_SOURCE} must have no imports so it can be copied verbatim into a function folder.`,
    );
  }
  const hash = createHash('sha256').update(code).digest('hex');
  const header =
    '// GENERATED FILE - DO NOT EDIT BY HAND.\n' +
    `// Source of truth: ${OUTBOUND_SOURCE}\n` +
    '// Regenerate: node scripts/generate-outbound-payload.mjs\n' +
    `// canonical-outbound-payload-sha256: ${hash}\n`;
  return { code, hash, content: header + code };
}

function main() {
  const { content, hash } = generateOutboundPayload();
  for (const dir of OUTBOUND_CONSUMER_DIRS) {
    writeFileSync(outboundPath(dir), content);
    console.log(`wrote ${outboundPath(dir)}`);
  }
  console.log(`canonical-outbound-payload-sha256: ${hash}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
