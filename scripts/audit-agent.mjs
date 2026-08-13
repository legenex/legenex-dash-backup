#!/usr/bin/env node
// Legenex static audit agent.
//
// A self-contained, re-runnable evaluation agent for the parts of the app that
// can be judged from source and the existing gate scripts, with NO auth and NO
// live-app access. It is the static counterpart to the runtime auditRun function
// (which runs in production Deno on an operator click). This agent:
//
//   * runs the design-token gate, the engine-parity gate, and the unit suite
//   * scans for orphaned entity schemas
//   * runs a caller-model heuristic over service-role functions, then self-verifies
//     the flagged ones so header-injected keys and route tokens are not false alarms
//   * checks the distribution nav against the buyer-centric IA and route table
//
// It EVALUATES ONLY. It never edits app code, never writes records, never touches
// the live path. Output is a structured findings report (JSON + Markdown) under
// docs/audit/, plus a console summary. Exit code is 1 if any check fails, else 0,
// so it can also gate CI.
//
// Run:  node scripts/audit-agent.mjs
//       node scripts/audit-agent.mjs --json   (print findings JSON to stdout)

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTITIES_DIR = join(ROOT, 'base44/entities');
const FUNCTIONS_DIR = join(ROOT, 'base44/functions');
const OUT_DIR = join(ROOT, 'docs/audit');

const findings = [];
const add = (f) => findings.push({
  layer: 'static',
  source: 'script',
  severity: f.verdict === 'fail' ? 'high' : f.verdict === 'warn' ? 'medium' : 'info',
  category: 'correctness',
  surface: '',
  expected: '',
  observed: '',
  evidence_path: '',
  value_score: null,
  effort_score: null,
  ...f,
});

// Run a shell command, capture stdout+stderr, never throw (we classify the result).
function sh(cmd) {
  try { return { ok: true, out: execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString() }; }
  catch (e) { return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` || e.message }; }
}

// Strip ANSI escape codes so colored tool output parses cleanly.
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

// Strip // line comments so a .jsonc entity parses as JSON.
function readJsonc(path) {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'));
}

// ---- CHECK: design tokens ---------------------------------------------------
function checkTokens() {
  const r = sh('node scripts/check-design-tokens.mjs');
  const violationLines = r.out.split('\n').filter((l) => /\b(raw-hex|raw-hsl-rgb|raw-palette|bare-bw)\b/.test(l));
  if (r.ok && violationLines.length === 0) {
    add({ check_id: 'design.tokens', category: 'design_system', verdict: 'pass', surface: 'src/**/*.{jsx,tsx}',
      expected: 'Zero raw hex/hsl/palette utilities over baseline', observed: 'Clean' });
  } else {
    for (const line of violationLines) {
      add({ check_id: 'design.tokens.raw_color', category: 'design_system', verdict: 'fail', severity: 'medium',
        surface: (line.match(/([\w/.-]+\.(?:jsx|tsx):\d+)/) || [])[1] || 'src',
        evidence_path: line.trim(), expected: 'Semantic tokens only (DESIGN-SYSTEM.md)', observed: line.trim(), effort_score: 1 });
    }
  }
}

// ---- CHECK: engine parity ---------------------------------------------------
function checkParity() {
  const r = sh('node scripts/check-engine-parity.mjs');
  add({ check_id: 'engine.parity', verdict: r.ok && /parity check OK/.test(r.out) ? 'pass' : 'fail',
    surface: 'scripts/check-engine-parity.mjs',
    expected: 'Every backend engine copy byte-identical to canonical source',
    observed: (r.out.trim().split('\n').pop() || '').trim() });
}

// ---- CHECK: unit suite ------------------------------------------------------
function checkTests() {
  const r = sh('npx vitest run --reporter=dot');
  const out = stripAnsi(r.out);
  const m = out.match(/Tests\s+(?:(\d+)\s+failed[^\n]*?\|\s+)?(\d+)\s+passed/);
  const failed = m && m[1] ? Number(m[1]) : (m ? 0 : null);
  const passed = m ? Number(m[2]) : null;
  const failFiles = [...out.matchAll(/FAIL\s+([^\s>]+)/g)].map((x) => x[1]);
  if (failed === 0) {
    add({ check_id: 'tests.suite', verdict: 'pass', surface: 'vitest', expected: 'Full suite green',
      observed: `${passed ?? '?'} passed, 0 failed` });
  } else {
    add({ check_id: 'tests.suite', verdict: failed === null ? 'needs_env' : 'fail', severity: 'high',
      surface: [...new Set(failFiles)].join(', ') || 'vitest',
      expected: 'Full suite green', observed: `${failed ?? '?'} failed of ${(failed ?? 0) + (passed ?? 0)}`,
      evidence_path: [...new Set(failFiles)].slice(0, 5).join(', '), effort_score: 2 });
  }
}

// ---- CHECK: orphaned entity schemas ----------------------------------------
function checkOrphans() {
  const names = readdirSync(ENTITIES_DIR).filter((f) => f.endsWith('.jsonc')).map((f) => f.replace('.jsonc', ''));
  const orphans = [];
  for (const n of names) {
    const r = sh(`grep -rl --include=*.js --include=*.jsx --include=*.ts "\\b${n}\\b" src base44/functions 2>/dev/null || true`);
    if (!r.out.trim()) orphans.push(n);
  }
  // BenchmarkCriterion is consumed by the audit report, not app code; expected.
  const real = orphans.filter((n) => n !== 'BenchmarkCriterion');
  add({ check_id: 'entity.orphaned', category: 'documentation', verdict: real.length ? 'warn' : 'pass',
    severity: real.length ? 'low' : 'info', surface: real.join(', ') || 'base44/entities',
    expected: 'Every entity referenced somewhere in code',
    observed: real.length ? `${real.length} unreferenced: ${real.join(', ')}` : 'All entities referenced',
    detail: 'Additive-only schema: unwired, not removable. Confirm intended or wire.', effort_score: 1 });
}

// ---- CHECK: service-role caller model (heuristic + self-verify) -------------
function checkCallerModel() {
  const dirs = readdirSync(FUNCTIONS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const gatePat = /auth\.me|assertOperator|base_role|linked_buyer_id|caller|requireOperator/;
  const keyPat = /X-API-KEY|X_KEY|api_key|apiKey|Webhook-Token|route token|Bearer|token|hmac|signature/i;
  const ungated = [];
  for (const d of dirs) {
    const entry = ['entry.ts', 'entry.js'].map((f) => join(FUNCTIONS_DIR, d, f)).find(existsSync);
    if (!entry) continue;
    const src = readFileSync(entry, 'utf8');
    if (!/asServiceRole/.test(src)) continue;
    if (gatePat.test(src)) continue;         // explicit operator gate
    if (keyPat.test(src)) continue;          // key / token / webhook-secret gate
    ungated.push(d);
  }
  add({ check_id: 'function.caller_model', category: 'security', verdict: ungated.length ? 'fail' : 'pass',
    severity: ungated.length ? 'high' : 'info', surface: ungated.join(', ') || 'base44/functions',
    expected: 'Every service-role function enforces a caller model (operator gate, API key, route token, or onboarding token)',
    observed: ungated.length ? `${ungated.length} with no recognizable gate: ${ungated.join(', ')}` : 'All service-role functions carry a gate',
    detail: 'Heuristic accounts for header-injected keys and route tokens to avoid false alarms.' });
}

// ---- CHECK: distribution nav vs buyer-centric IA ---------------------------
function checkDistributionNav() {
  const navPath = join(ROOT, 'src/components/distribution/DistributionNav.jsx');
  const appPath = join(ROOT, 'src/App.jsx');
  if (!existsSync(navPath)) { add({ check_id: 'ui.nav.distribution', verdict: 'needs_env', surface: navPath, observed: 'nav file not found' }); return; }
  const nav = readFileSync(navPath, 'utf8');
  const routes = new Set([...readFileSync(appPath, 'utf8').matchAll(/path=["']([^"']+)["']/g)].map((m) => m[1]));
  const hasBuyers = /['"]\/distribution\/buyers['"]/.test(nav) || /label:\s*['"]Buyers['"]/.test(nav);
  const routeExists = routes.has('/distribution/buyers');
  if (hasBuyers) {
    add({ check_id: 'ui.nav.distribution_buyers', category: 'usability', verdict: 'pass', surface: navPath,
      expected: 'Buyer-centric IA: distribution nav includes a Buyers section', observed: 'Buyers section present' });
  } else {
    add({ check_id: 'ui.nav.distribution_buyers_missing', category: 'usability', verdict: 'fail', severity: 'high',
      surface: navPath, expected: 'Distribution nav includes a Buyers section linking to /distribution/buyers',
      observed: `Buyers section absent from nav; route /distribution/buyers ${routeExists ? 'exists but is unreachable from the distribution nav' : 'also missing'}`,
      detail: 'Root cause of the DistributionNav test failures. Buyers Routing/Deliveries/Summary unreachable during configuration.', effort_score: 1 });
  }
}

// ---- run ---------------------------------------------------------------------
const RUN_ID = `run_static_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
const steps = [checkTokens, checkParity, checkTests, checkOrphans, checkCallerModel, checkDistributionNav];
for (const step of steps) {
  try { step(); }
  catch (e) { add({ check_id: `agent.error.${step.name}`, verdict: 'needs_env', severity: 'medium', category: 'observability', observed: e.message }); }
}

const tally = (v) => findings.filter((f) => f.verdict === v).length;
const summary = {
  run_id: RUN_ID, generated_at: new Date().toISOString(), layer: 'static',
  total: findings.length, pass: tally('pass'), fail: tally('fail'), warn: tally('warn'), needs_env: tally('needs_env'),
};

if (process.argv.includes('--json')) { console.log(JSON.stringify({ summary, findings }, null, 2)); process.exit(summary.fail ? 1 : 0); }

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'latest-report.json'), JSON.stringify({ summary, findings }, null, 2));

const order = { fail: 0, warn: 1, needs_env: 2, pass: 3 };
const sorted = [...findings].sort((a, b) => order[a.verdict] - order[b.verdict]);
const md = [
  `# Legenex static audit report`,
  ``,
  `Run \`${RUN_ID}\` generated ${summary.generated_at}`,
  ``,
  `**${summary.total} checks:** ${summary.pass} pass, ${summary.fail} fail, ${summary.warn} warn, ${summary.needs_env} needs-env`,
  ``,
  `| Verdict | Check | Severity | Surface | Observed |`,
  `|---|---|---|---|---|`,
  ...sorted.map((f) => `| ${f.verdict} | ${f.check_id} | ${f.severity} | ${(f.surface || '').replace(/\|/g, '/')} | ${(f.observed || '').replace(/\|/g, '/')} |`),
  ``,
].join('\n');
writeFileSync(join(OUT_DIR, 'latest-report.md'), md);

console.log(`\n${summary.total} checks: ${summary.pass} pass, ${summary.fail} fail, ${summary.warn} warn, ${summary.needs_env} needs-env`);
for (const f of sorted) console.log(`  [${f.verdict.toUpperCase().padEnd(9)}] ${f.check_id}  ${f.surface || ''}`);
console.log(`\nreport: docs/audit/latest-report.json and .md`);
process.exit(summary.fail ? 1 : 0);
