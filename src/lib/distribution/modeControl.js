// Operating-mode control (Phase 16). Pure decision logic plus a small executor
// used by the bundled orchestration, so each mode has real, tested behavior and
// double-send is structurally impossible. Mode transitions are performed by an
// audited operator-only backend function (distributionSetMode), never a raw edit.

export const MODES = ['legacy_only', 'shadow', 'canary', 'new_primary_with_legacy_fallback', 'new_only'];

// A lead is canary only if it matches an EXPLICIT allowlist (test supplier key,
// test campaign, or explicit source marker). Nothing is canary by default.
export function isCanaryLead(lead, allowlist = {}) {
  const l = lead || {};
  if (allowlist.supplierKeys && allowlist.supplierKeys.includes(l._supplier_key)) return true;
  if (allowlist.campaignIds && allowlist.campaignIds.includes(l.campaign_id)) return true;
  if (allowlist.sourceMarker && String(l.source || '') === allowlist.sourceMarker) return true;
  return false;
}

// What runs for this lead under this mode. native: 'none'|'shadow'|'deliver';
// legacy: 'authoritative'|'fallback'|'off'.
export function planExecution(mode, lead, opts = {}) {
  switch (mode) {
    case 'shadow': return { native: 'shadow', legacy: 'authoritative' };
    case 'canary':
      return isCanaryLead(lead, opts.canaryAllowlist)
        ? { native: 'deliver', legacy: 'off', canary: true, destinationAllowlist: opts.canaryAllowlist?.destinations }
        : { native: 'none', legacy: 'authoritative' };
    case 'new_primary_with_legacy_fallback': return { native: 'deliver', legacy: 'fallback' };
    case 'new_only': return { native: 'deliver', legacy: 'off' };
    case 'legacy_only':
    default: return { native: 'none', legacy: 'authoritative' };
  }
}

// Fallback to legacy is allowed ONLY when native did not (and could not have)
// delivered: a clean failure in the approved category list. Never on accepted and
// never on ambiguous (which might have been received) - that would risk a double-send.
export function shouldFallback(nativeStatus, approvedFailureCategories = ['no_eligible_member', 'rejected', 'error_clean']) {
  const s = String(nativeStatus || '');
  if (s === 'accepted' || s === 'ambiguous' || s === 'duplicate') return false;
  return approvedFailureCategories.includes(s);
}

// Execute a mode for one lead with injected deliver functions. Returns what
// actually ran. Structurally guarantees at most one successful delivery path.
export async function executeMode(mode, lead, ctx) {
  const plan = planExecution(mode, lead, { canaryAllowlist: ctx.canaryAllowlist });
  const out = { mode, plan, native: null, legacy: null };

  if (plan.native === 'shadow') {
    out.native = ctx.nativeShadow ? await ctx.nativeShadow(lead) : { status: 'traced' };
  } else if (plan.native === 'deliver') {
    out.native = await ctx.nativeDeliver(lead);
    if (plan.legacy === 'fallback' && shouldFallback(out.native.status, ctx.approvedFailureCategories)) {
      out.legacy = await ctx.legacyDeliver(lead);
    }
  }
  if (plan.legacy === 'authoritative') {
    out.legacy = await ctx.legacyDeliver(lead);
  }
  return out;
}

export function validateModeTransition(from, to) {
  if (!MODES.includes(to)) return { valid: false, error: 'unknown_mode' };
  if (from === to) return { valid: false, error: 'no_change' };
  return { valid: true };
}

export function buildModeAudit({ from, to, actorId, reason, nowMs }) {
  return {
    action: 'mode_change', entity_type: 'AppSettings', entity_id: 'distribution_mode',
    from_value: from || 'legacy_only', to_value: to, reason: reason || '', actor_id: actorId,
    created_at: new Date(nowMs || 0).toISOString(),
  };
}
