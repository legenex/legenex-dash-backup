/* global process */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// AutoCreatedReviewBanner drives both the buyer and supplier review surfaces from
// one CONFIG object, and the component body calls cfg.<name> without checking.
//
// A half-finished rename in that object (refsFromLead on one kind, refFromLead on
// the other) made cfg.refFromLead undefined for buyers, which threw the moment the
// leads query resolved and blanked the entire Operations Buyers page. Neither
// esbuild nor eslint can see it: it is a runtime property lookup on an object
// literal.
//
// This is a static test on purpose. The component imports the base44 client, which
// we do not want to pull into a node-environment test run just to assert a shape.
const SRC = path.join(process.cwd(), 'src/components/operations/AutoCreatedReviewBanner.jsx');
const src = fs.readFileSync(SRC, 'utf8');

// Slice a balanced { ... } block starting at the first brace after `label`.
function blockAfter(text, label) {
  const at = text.indexOf(label);
  if (at === -1) return '';
  const open = text.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return '';
}

const configBlock = blockAfter(src, 'const CONFIG');
const kindBlocks = {
  buyer: blockAfter(configBlock, 'buyer:'),
  supplier: blockAfter(configBlock, 'supplier:'),
};

// Top-level keys of a kind block, ignoring anything nested deeper.
function topLevelKeys(block) {
  const keys = new Set();
  let depth = 0;
  for (const line of block.split('\n')) {
    const before = depth;
    for (const ch of line) {
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      else if (ch === '}' || ch === ']' || ch === ')') depth--;
    }
    if (before === 1) {
      const m = line.match(/^\s*(\w+)\s*:/);
      if (m) keys.add(m[1]);
    }
  }
  return keys;
}

// Every cfg.<name> the component body actually reads.
const used = new Set(
  [...src.matchAll(/\bcfg\.(\w+)/g)].map((m) => m[1]),
);

describe('AutoCreatedReviewBanner CONFIG contract', () => {
  it('parses both kind blocks', () => {
    expect(configBlock.length).toBeGreaterThan(0);
    expect(kindBlocks.buyer.length).toBeGreaterThan(0);
    expect(kindBlocks.supplier.length).toBeGreaterThan(0);
  });

  it('reads at least the core accessors', () => {
    for (const name of ['entity', 'refFromLead', 'matches', 'build', 'nameOf', 'codeOf']) {
      expect(used).toContain(name);
    }
  });

  for (const kind of ['buyer', 'supplier']) {
    it(`${kind} defines every key the component calls`, () => {
      const keys = topLevelKeys(kindBlocks[kind]);
      const missing = [...used].filter((k) => !keys.has(k));
      expect(missing).toEqual([]);
    });
  }

  it('both kinds expose an identical key set, so neither can half-migrate', () => {
    const b = [...topLevelKeys(kindBlocks.buyer)].sort();
    const s = [...topLevelKeys(kindBlocks.supplier)].sort();
    expect(b).toEqual(s);
  });

  it('uses the singular refFromLead and never the old plural form', () => {
    expect(src).not.toContain('refsFromLead');
  });

  it('build() keeps auto-created records inert: no pricing, no coverage', () => {
    for (const kind of ['buyer', 'supplier']) {
      const build = blockAfter(kindBlocks[kind], 'build:');
      expect(build).toContain('auto_created: true');
      expect(build).toContain('active: false');
      // Check the KEYS being written, not the raw text: the notes string
      // legitimately mentions pricing and coverage as documentation.
      const written = [...topLevelKeys(build)];
      const banned = written.filter((k) => /price|pricing|cpl|coverage|payout_value|credit_limit|balance|ipl_fee/i.test(k));
      expect(banned).toEqual([]);
    }
  });
});