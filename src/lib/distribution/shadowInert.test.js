import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Static regression proof that the shadow hook cannot alter the legacy supplier
// response. The hook is gated to shadow mode ONLY, so on legacy_only (production
// default) the whole block is skipped and the response path is byte-identical to
// the pre-hook code. Delivering modes do not enter it either: they are handled by
// the native distribution block, which writes its own trace, so exactly one
// RouteDecisionTrace is produced per lead.
// Combined with shadowHook.test.js proving runShadow is a no-op on legacy_only.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const entry = readFileSync(join(root, 'base44/functions/processLead/entry.ts'), 'utf8');

const SHADOW_GUARD = "if (distributionMode === 'shadow')";

// Extract the hook block: from its marker comment to the matching closing brace.
function hookBlock(src) {
  const start = src.indexOf('Distribution engine SHADOW hook');
  const guardIdx = src.indexOf(SHADOW_GUARD, start);
  // slice a generous window; the block is short and self-contained
  return src.slice(guardIdx, guardIdx + 1400);
}

describe('shadow hook is inert on legacy_only (static regression)', () => {
  it('distribution_mode defaults to legacy_only', () => {
    expect(entry).toMatch(/distributionMode\s*=/);
    expect(entry).toContain("? distModeRaw : 'legacy_only'");
  });

  it('the hook is fully guarded by an exact shadow-mode check', () => {
    expect(entry).toContain(SHADOW_GUARD);
    // exactly one such guard
    const count = (entry.match(/if \(distributionMode === 'shadow'\)/g) || []).length;
    expect(count).toBe(1);
    // and no broad "anything past legacy_only" guard remains, which would make the
    // hook run in delivering modes and double-trace the lead
    expect(entry).not.toContain("if (distributionMode !== 'legacy_only')");
  });

  it('inside the hook, the ONLY entity write is RouteDecisionTrace (no response/lead mutation)', () => {
    const block = hookBlock(entry);
    const writes = block.match(/db\.entities\.(\w+)\.(create|update|delete)/g) || [];
    for (const w of writes) expect(w).toContain('RouteDecisionTrace');
    // does not return from the handler or touch the response envelope
    expect(block).not.toMatch(/\breturn\b/);
    expect(block).not.toMatch(/supplierResponse|buildEnvelope|Response\.json/);
  });

  it('the engine is loaded lazily (dynamic import) so legacy_only never loads it', () => {
    const block = hookBlock(entry);
    expect(block).toContain("await import('./routingEngine.generated.js')");
    // no top-level static import of the generated engine (would run even on legacy_only)
    expect(entry).not.toMatch(/^import .*routingEngine\.generated/m);
  });
});
