#!/usr/bin/env node
// Plain English backend summary generator.
//
// Reads every backend function and entity schema and produces a short, readable
// description of what each one does, so the review workspace can show "what this
// page's backend actually does" as bullets a person can read and comment on,
// rather than a list of file names.
//
// The descriptions are EXTRACTED, not invented: each function's summary comes
// from the header comment already written at the top of its entry file. Where a
// function has no header comment, that is reported as a gap rather than filled in
// with a guess, because an undocumented function in the lead pipeline is itself
// worth knowing about.
//
// Also derives, from the source:
//   * which entities the function reads and which it writes
//   * whether it touches a RED surface
//   * whether it enforces a caller model before reading
//
// Output: src/lib/progress/backendSummary.json
//
// Run:  node scripts/generate-backend-summary.mjs
//       node scripts/generate-backend-summary.mjs --check

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = join(ROOT, 'base44/functions');
const ENTITIES_DIR = join(ROOT, 'base44/entities');
const OUT = join(ROOT, 'src/lib/progress/backendSummary.json');

const CHECK_ONLY = process.argv.includes('--check');

// Surfaces that must never be changed without explicit approval.
const RED_PATTERNS = [
  { key: 'processLead', re: /processlead/i },
  { key: 'leadbyte_connectors', re: /leadbyteconnector|leadbytewebhook/i },
  { key: 'conversion_events', re: /conversionevent|capiconnector/i },
  { key: 'distribution_mode', re: /distribution_?mode|distributionsetmode/i },
  { key: 'credentials', re: /\bapi_?key\b|\bsecret\b|\bcredential/i },
  { key: 'billing', re: /billingrun|billinglineitem|\binvoice\b|buyerpayment|supplierpayout/i },
  { key: 'buyer_pricing', re: /buyerstatecpl|buyercplrule|statestatus/i },
  { key: 'trustedform', re: /trustedform|certbackup/i },
  { key: 'portal_scoping', re: /portaldata|supplierportaldata|portalprojection/i },
];

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

// Extracted text is normalised so the house rule against em dashes holds in
// generated artefacts too, not just in hand written prose.
const normalise = (s) => (s || '').replace(/\u2014/g, ', ').replace(/\s+,/g, ',');

// Pull the leading block of // comments that sits above the first statement.
// That is where this codebase puts its explanation of what a function is for.
//
// Imports are stripped first, including multi-line ones. A line-by-line scan that
// only recognises lines beginning with "import" mistakes the continuation lines of
// a braced import for code and gives up, which made well documented functions
// report as undocumented.
function headerComment(code) {
  const withoutImports = code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?/gm, '');

  const collected = [];
  let touchesDeclaration = false;
  const lines = withoutImports.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      // A blank line before any comment is just spacing; after one, it is a
      // paragraph break inside the block.
      if (collected.length) collected.push('');
      continue;
    }
    if (line.startsWith('//')) {
      collected.push(line.replace(/^\/\/\s?/, ''));
      continue;
    }
    // First real statement ends the header. If it sits directly under the last
    // comment line with no blank line between, the comment documents THAT
    // declaration rather than the file. processLead is the case that matters:
    // its first comment describes a phone-verification helper, and presenting it
    // as the purpose of the lead pipeline would be worse than saying nothing.
    const previous = lines[i - 1]?.trim();
    if (previous && previous.startsWith('//')) touchesDeclaration = true;
    break;
  }
  while (collected.length && collected[collected.length - 1] === '') collected.pop();
  if (touchesDeclaration) return [];
  return collected;
}

// Turn the comment block into a headline plus supporting bullets.
function shapeSummary(commentLines) {
  const text = commentLines.join('\n').trim();
  if (!text) return { headline: '', detail: [], documented: false };

  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);

  const first = paragraphs[0] || '';
  // The first sentence of the first paragraph is the headline.
  const headline = (first.match(/^(.*?[.!?])(\s|$)/)?.[1] || first).trim();
  const rest = first.slice(headline.length).trim();

  const detail = [];
  if (rest) detail.push(rest);
  paragraphs.slice(1).forEach((p) => detail.push(p));

  return {
    headline: headline.replace(/\s+/g, ' '),
    // Keep it readable: a handful of short points, not the whole essay.
    detail: detail.map((d) => d.replace(/\s+/g, ' ')).filter((d) => d.length > 12).slice(0, 4),
    documented: true,
  };
}

function analyseFunction(name) {
  const dir = join(FUNCTIONS_DIR, name);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;

  const entryPath = ['entry.ts', 'entry.js', 'index.ts']
    .map((f) => join(dir, f))
    .find((p) => existsSync(p));
  if (!entryPath) return null;

  const code = read(entryPath);
  const summary = shapeSummary(headerComment(code));

  const reads = new Set();
  const writes = new Set();
  let m;

  // Entity access is written either as base44.entities.X or through an alias, and
  // `const svc = base44.asServiceRole.entities` is the common form in this repo.
  // Matching only the literal "entities." prefix missed every write made through
  // an alias, which reported writing functions as read only.
  const aliases = new Set(['entities']);
  const aliasRe = /const\s+([A-Za-z_$][\w$]*)\s*=\s*[\w.$]*\.entities\b/g;
  while ((m = aliasRe.exec(code))) aliases.add(m[1]);

  const prefix = [...aliases].map((a) => a.replace(/[$]/g, '\\$')).join('|');
  const entityRe = new RegExp(`(?:${prefix})\\.([A-Z][A-Za-z0-9_]*)\\s*\\.\\s*([a-zA-Z]+)`, 'g');
  const WRITE_METHODS = ['create', 'update', 'delete', 'bulkCreate', 'updateMany', 'deleteMany'];
  while ((m = entityRe.exec(code))) {
    const [, entity, method] = m;
    if (WRITE_METHODS.includes(method)) writes.add(entity);
    else reads.add(entity);
  }

  const red = RED_PATTERNS.filter((r) => r.re.test(name) || r.re.test(code)).map((r) => r.key);

  // How the function establishes who is calling. Descriptive, not a verdict:
  // an inbound endpoint authenticated by supplier API key is correct, and calling
  // that a caller-model gap would be a false finding. The real caller-model check
  // with self-verification lives in scripts/audit-agent.mjs; this only reports the
  // style so a reader knows what to expect.
  const usesServiceRole = /asServiceRole/.test(code);
  const hasSession = /auth\.me\(\)/.test(code);
  const checksRole = /(base_role|linked_buyer_id|permissions\[|role\s*!==\s*'admin')/.test(code);
  const usesApiKey = /x-api-key|apiKey|api_key|entities\.ApiKey|ReferenceKey/i.test(code);
  const usesRouteToken = /route_token|inbound_token|webhook_token|\btoken\b/i.test(code);

  let authStyle = 'none_detected';
  if (hasSession && checksRole) authStyle = 'operator_session';
  else if (hasSession) authStyle = 'session_only';
  else if (usesApiKey) authStyle = 'api_key';
  else if (usesRouteToken) authStyle = 'route_token';

  const externalCalls = [];
  const fetchRe = /fetch\(\s*[`'"]?(https?:\/\/[^`'")\s]+)/g;
  while ((m = fetchRe.exec(code))) {
    try { externalCalls.push(new URL(m[1]).host); } catch { /* ignore */ }
  }

  return {
    name,
    file: entryPath.replace(`${ROOT}/`, ''),
    lines: code.split('\n').length,
    headline: normalise(summary.headline),
    detail: summary.detail.map(normalise),
    documented: summary.documented,
    reads: [...reads].sort(),
    writes: [...writes].sort(),
    read_only: writes.size === 0,
    uses_service_role: usesServiceRole,
    auth_style: authStyle,
    external_hosts: [...new Set(externalCalls)].sort(),
    red_surfaces: red,
  };
}

function analyseEntity(file) {
  const raw = read(join(ENTITIES_DIR, file));
  let schema;
  try { schema = JSON.parse(raw); } catch { return null; }

  const props = schema.properties || {};
  const names = Object.keys(props);
  const described = names.filter((n) => props[n]?.description);

  // Entity schemas carry no top level description in this codebase, so the
  // readable summary is assembled from the field descriptions that exist.
  const highlights = described
    .slice(0, 4)
    .map((n) => `${n}: ${props[n].description}`);

  return {
    name: schema.name || file.replace('.jsonc', ''),
    file: `base44/entities/${file}`,
    field_count: names.length,
    required: schema.required || [],
    documented_fields: described.length,
    undocumented_fields: names.length - described.length,
    has_rls: Boolean(schema.rls && Object.keys(schema.rls).length),
    rls_operations: schema.rls ? Object.keys(schema.rls) : [],
    highlights: highlights.map(normalise),
  };
}

const functionNames = existsSync(FUNCTIONS_DIR)
  ? readdirSync(FUNCTIONS_DIR).filter((f) => !f.startsWith('_') && !f.startsWith('.'))
  : [];

const functions = functionNames
  .map(analyseFunction)
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));

const entities = (existsSync(ENTITIES_DIR) ? readdirSync(ENTITIES_DIR) : [])
  .filter((f) => f.endsWith('.jsonc'))
  .map(analyseEntity)
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));

const payload = {
  generated_at: new Date().toISOString(),
  generator: 'scripts/generate-backend-summary.mjs',
  counts: {
    functions: functions.length,
    documented: functions.filter((f) => f.documented).length,
    undocumented: functions.filter((f) => !f.documented).length,
    read_only: functions.filter((f) => f.read_only).length,
    no_auth_detected: functions.filter((f) => f.auth_style === 'none_detected').length,
    entities: entities.length,
    entities_without_rls: entities.filter((e) => !e.has_rls).length,
  },
  functions,
  entities,
};

const next = `${JSON.stringify(payload, null, 2)}\n`;
const strip = (s) => s.replace(/"generated_at":\s*"[^"]*",?\n/, '').trim();
const prevRaw = read(OUT);
const changed = strip(prevRaw) !== strip(next);

if (CHECK_ONLY) {
  if (changed) {
    console.error('backend summary is STALE. Run: node scripts/generate-backend-summary.mjs');
    process.exit(1);
  }
  console.log(`backend summary OK. ${payload.counts.functions} functions, ${payload.counts.entities} entities.`);
  process.exit(0);
}

if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, next);

const c = payload.counts;
console.log(`backend summary written: ${OUT.replace(`${ROOT}/`, '')}`);
console.log(`  ${c.functions} functions (${c.documented} documented, ${c.undocumented} with no header comment)`);
console.log(`  ${c.read_only} read only, ${c.no_auth_detected} with no authentication style detected (heuristic, see audit-agent for the real check)`);
console.log(`  ${c.entities} entities, ${c.entities_without_rls} without row level security`);
