// Generates the per-function copies of the canonical supplier rules module
// from src/lib/supplierRules.js. Run: node scripts/generate-supplier-rules.mjs
//
// Same mechanism and same reasoning as scripts/generate-lead-identity.mjs: the
// Base44 function bundler cannot resolve a relative import outside a function's
// own folder, so each consuming function gets an identical generated copy
// alongside its entry.ts. These copies are generated artifacts only. The parity
// check (scripts/check-engine-parity.mjs) fails if any copy drifts.
//
// Supplier attribution has to be decided identically whether a call arrives via
// the Ringba pull or via a buyer's sheet. Two hand-written copies of that logic
// would eventually disagree and put money against the wrong supplier, so there
// is one canonical module and generated copies.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export const RULES_SOURCE = 'src/lib/supplierRules.js';

export const RULES_CONSUMER_DIRS = [
  'base44/functions/pullCallLogs',
  'base44/functions/syncGoogleSheets',
];

export const rulesPath = (dir) => `${dir}/supplierRules.generated.js`;

export function generateSupplierRules() {
  const code = readFileSync(RULES_SOURCE, 'utf8');
  if (/^\s*import\s/m.test(code)) {
    throw new Error(
      `${RULES_SOURCE} must have no imports so it can be copied verbatim into a function folder.`,
    );
  }
  const hash = createHash('sha256').update(code).digest('hex');
  const header =
    '// GENERATED FILE - DO NOT EDIT BY HAND.\n' +
    `// Source of truth: ${RULES_SOURCE}\n` +
    '// Regenerate: node scripts/generate-supplier-rules.mjs\n' +
    `// canonical-supplier-rules-sha256: ${hash}\n`;
  return { code, hash, content: header + code };
}

function main() {
  const { content, hash } = generateSupplierRules();
  for (const dir of RULES_CONSUMER_DIRS) {
    writeFileSync(rulesPath(dir), content);
    console.log(`wrote ${rulesPath(dir)}`);
  }
  console.log(`canonical-supplier-rules-sha256: ${hash}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
