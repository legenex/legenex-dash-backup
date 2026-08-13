#!/usr/bin/env node
// Design-token gate. Scans .jsx/.tsx under src/ for banned styling patterns that
// bypass the semantic tokens in DESIGN-SYSTEM.md:
//   - raw hex color literals in className (Tailwind arbitrary values like bg-[#3DD68C])
//   - raw hsl()/rgb()/rgba() literals in className (bg-[hsl(152_65%_54%)],
//     border-[hsl(38_78%_58%/0.4)]); token references like [hsl(var(--border))] are allowed
//   - raw Tailwind palette utilities (bg-gray-800, text-slate-400, border-zinc-700,
//     and every default color family) instead of the semantic tokens
//   - bare text-white / text-black / bg-white / bg-black
//
// The tree carries pre-existing usage, so like the lint zero-new rule this fails
// only on NEW violations over a committed baseline (design-baseline.json, a map of
// relative path -> violation count). Files not in the baseline must be clean.
//
// Usage:
//   node scripts/check-design-tokens.mjs                 # check (CI gate)
//   node scripts/check-design-tokens.mjs --update-baseline   # rewrite the baseline

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const BASELINE_PATH = join(ROOT, 'design-baseline.json');

// Default Tailwind color families that must come from a semantic token instead.
const PALETTE = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
  'purple', 'fuchsia', 'pink', 'rose',
].join('|');
const PREFIX = '(?:bg|text|border|ring|from|via|to|divide|fill|stroke|ring-offset|placeholder|caret|decoration|outline|shadow|accent)';

const PATTERNS = [
  // Tailwind arbitrary hex value, e.g. bg-[#3DD68C], text-[#fff], border-[#243044]/40
  { name: 'raw-hex', re: new RegExp(`${PREFIX}-\\[#[0-9a-fA-F]{3,8}\\]`, 'g') },
  // Tailwind arbitrary hsl()/rgb()/rgba() literal, e.g. bg-[hsl(152_65%_54%)],
  // border-[hsl(38_78%_58%/0.4)]. Token references like [hsl(var(--border))] are allowed.
  { name: 'raw-hsl-rgb', re: new RegExp(`${PREFIX}-\\[(?:hsl|hsla|rgb|rgba)\\((?!var\\()`, 'g') },
  // Raw palette utility, e.g. bg-gray-800, text-slate-400, border-zinc-700
  { name: 'raw-palette', re: new RegExp(`\\b${PREFIX}-(?:${PALETTE})-[0-9]{2,3}\\b`, 'g') },
  // Bare white/black
  { name: 'bare-bw', re: /\b(?:bg|text|border|ring|fill|stroke)-(?:white|black)\b/g },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (/\.(jsx|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// Return the list of violations for a file: [{ line, col, text, pattern }].
function scanFile(full) {
  const src = readFileSync(full, 'utf8');
  const lines = src.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        hits.push({ line: i + 1, col: m.index + 1, text: m[0], pattern: name });
      }
    }
  });
  return hits;
}

function scanTree() {
  const map = {};
  for (const full of walk(SRC)) {
    const rel = relative(ROOT, full).split('\\').join('/');
    const hits = scanFile(full);
    if (hits.length) map[rel] = hits;
  }
  return map;
}

const results = scanTree();
const counts = Object.fromEntries(Object.entries(results).map(([f, h]) => [f, h.length]));
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (process.argv.includes('--update-baseline')) {
  const ordered = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_PATH, JSON.stringify(ordered, null, 2) + '\n');
  console.log(`design:baseline written: ${Object.keys(ordered).length} files, ${total} total violations`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : {};

let failed = false;
for (const [file, hits] of Object.entries(results)) {
  const allowed = baseline[file] || 0;
  if (hits.length > allowed) {
    failed = true;
    console.error(`\n${file}: ${hits.length} violations (baseline ${allowed}) -> ${hits.length - allowed} NEW`);
    for (const h of hits) console.error(`  ${file}:${h.line}:${h.col}  ${h.pattern}  ${h.text}`);
  }
}

if (failed) {
  console.error('\ndesign:check FAILED. Use semantic tokens (DESIGN-SYSTEM.md); no raw hex or raw palette utilities.');
  console.error('If a violation is a genuine, reviewed exception, run: node scripts/check-design-tokens.mjs --update-baseline');
  process.exit(1);
}

console.log(`design:check OK. ${total} baselined violations across ${Object.keys(counts).length} files; zero new.`);
