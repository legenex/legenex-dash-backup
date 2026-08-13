// Generates the single self-contained backend routing-engine bundle from the
// canonical source (src/lib/distribution/backend-entry.js). The output is a
// no-import ESM module that a Base44 Deno function can consume, plus a content
// hash header. Run: node scripts/generate-backend-engine.mjs
//
// This is the allowed "generated copy" mechanism for one canonical engine: the
// backend never hand-maintains a mirror; it consumes this generated file, and a
// blocking parity check (scripts/check-engine-parity.mjs) fails CI if the file
// is stale relative to the canonical source.

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const OUT_PATH = 'base44/functions/_shared/routingEngine.generated.js';
// The Base44 function bundler cannot resolve relative imports outside a
// function's own folder, so every consuming function gets an identical
// generated copy alongside its entry.ts. These copies are generated artifacts
// only: the parity check fails if any of them drifts from the canonical bundle.
export const CONSUMER_DIRS = [
  'base44/functions/processLead',
  'base44/functions/distributionSimulate',
  'base44/functions/distributionSetMode',
  'base44/functions/distributionConfig',
  'base44/functions/distributionShadowReport',
  'base44/functions/campaignDeliveryTest',
  'base44/functions/auditRun',
];
export const consumerPath = (dir) => `${dir}/routingEngine.generated.js`;
const ENTRY = 'src/lib/distribution/backend-entry.js';

export async function generateBundle() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    write: false,
    legalComments: 'none',
  });
  const code = result.outputFiles[0].text;
  const hash = createHash('sha256').update(code).digest('hex');
  const header =
    '// GENERATED FILE - DO NOT EDIT BY HAND.\n' +
    '// Source of truth: src/lib/distribution/backend-entry.js and its imports.\n' +
    '// Regenerate: node scripts/generate-backend-engine.mjs\n' +
    `// canonical-engine-sha256: ${hash}\n`;
  return { code, hash, content: header + code };
}

async function main() {
  const { content, hash } = await generateBundle();
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, content);
  console.log(`wrote ${OUT_PATH} (canonical-engine-sha256: ${hash})`);
  for (const dir of CONSUMER_DIRS) {
    writeFileSync(consumerPath(dir), content);
    console.log(`wrote ${consumerPath(dir)}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
