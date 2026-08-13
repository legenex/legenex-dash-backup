// Generates the per-function copies of the canonical lead identity module from
// src/lib/leadIdentity.js. Run: node scripts/generate-lead-identity.mjs
//
// Same mechanism and same reasoning as scripts/generate-backend-engine.mjs: the
// Base44 function bundler cannot resolve a relative import outside a function's
// own folder, so each consuming function gets an identical generated copy
// alongside its entry.ts. These copies are generated artifacts only. The parity
// check (scripts/check-engine-parity.mjs) fails if any copy drifts.
//
// No bundling step is needed here because the canonical module has no imports.
// If that ever changes, this script must switch to esbuild like the engine one.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const SOURCE = 'src/lib/leadIdentity.js';

export const IDENTITY_CONSUMER_DIRS = [
  'base44/functions/processLead',
  'base44/functions/leadbyteWebhook',
  'base44/functions/leadDedupe',
];

export const identityPath = (dir) => `${dir}/leadIdentity.generated.js`;

export function generateIdentity() {
  const code = readFileSync(SOURCE, 'utf8');
  if (/^\s*import\s/m.test(code)) {
    throw new Error(
      `${SOURCE} must have no imports so it can be copied verbatim into a function folder.`,
    );
  }
  const hash = createHash('sha256').update(code).digest('hex');
  const header =
    '// GENERATED FILE - DO NOT EDIT BY HAND.\n' +
    `// Source of truth: ${SOURCE}\n` +
    '// Regenerate: node scripts/generate-lead-identity.mjs\n' +
    `// canonical-identity-sha256: ${hash}\n`;
  return { code, hash, content: header + code };
}

function main() {
  const { content, hash } = generateIdentity();
  for (const dir of IDENTITY_CONSUMER_DIRS) {
    writeFileSync(identityPath(dir), content);
    console.log(`wrote ${identityPath(dir)}`);
  }
  console.log(`canonical-identity-sha256: ${hash}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
