// Find and optionally remove duplicate leads.
//
// A double-run CSV import on 19 July 2026 wrote 40+ leads twice under a single
// import_batch_id, inflating every Sold count in the app. The importer now
// blocks on duplicates and asks, but the records already written need cleaning.
//
// Two modes:
//   { mode: 'scan'  }  (default) reports what it would do and changes nothing
//   { mode: 'apply' }  deletes the redundant copies
//
// The OLDEST record in each group is always kept, because it is the one other
// records (deliveries, billing, events) were written against. Newer copies are
// merged into it first: any field the keeper is missing but a duplicate has is
// copied across, so removing the copy cannot lose data.
//
// Operator-gated. Never exposed to portal users.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];

// Operator authorization, mirroring the other service-role functions: admins
// and operators holding a management permission are allowed; portal (buyer or
// supplier) accounts are rejected outright. Deleting leads must never be
// reachable from a portal session.
function isOperator(caller: any): boolean {
  if (!caller) return false;
  if (caller.base_role === 'supplier' || caller.base_role === 'buyer') return false;
  if (caller.linked_buyer_id || caller.linked_supplier_id) return false;
  let permissions: Record<string, any> = {};
  try {
    permissions = typeof caller.permissions === 'string'
      ? JSON.parse(caller.permissions || '{}')
      : (caller.permissions || {});
  } catch { permissions = {}; }
  return caller.role === 'admin' || OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
}

function normEmail(v: unknown): string | null {
  return String(v ?? '').trim().toLowerCase() || null;
}

function normMobile(v: unknown): string | null {
  const digits = String(v ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const trimmed = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return trimmed.length >= 7 ? trimmed : null;
}

// Fields worth rescuing from a duplicate before it is deleted.
const MERGEABLE = [
  'revenue', 'supplier_payout', 'buyer_name', 'final_status', 'state',
  'mapped_fields', 'raw_payload', 'trustedform_url', 'jornaya_token',
  'first_name', 'last_name', 'email', 'mobile', 'timestamp',
];

const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || v === 0;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === 'apply' ? 'apply' : 'scan';

    // Page through every LIVE lead. A single call is capped at 500 rows.
    // Archived records are excluded: they are already retired, and including
    // them would re-flag every duplicate that has previously been handled.
    const all: any[] = [];
    const pageSize = 500;
    for (let page = 0; page < 400; page += 1) {
      const batch = await base44.asServiceRole.entities.Lead.filter({ archived: false }, 'created_date', pageSize, page * pageSize);
      if (!batch || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < pageSize) break;
    }

    // Group by the first key that identifies a person. Email wins over mobile so
    // one person cannot land in two groups.
    const byKey = new Map<string, any[]>();
    for (const l of all) {
      const key = normEmail(l.email) || normMobile(l.mobile);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(l);
    }

    const groups: any[] = [];
    for (const [key, members] of byKey) {
      if (members.length < 2) continue;
      // Already sorted ascending by created_date from the list call above.
      const [keep, ...rest] = members;
      groups.push({ key, keep, remove: rest });
    }

    const duplicateCount = groups.reduce((a, g) => a + g.remove.length, 0);

    const sample = groups.slice(0, 25).map((g) => ({
      key: g.key,
      keep_id: g.keep.id,
      keep_created: g.keep.created_date,
      remove_ids: g.remove.map((r: any) => r.id),
      remove_created: g.remove.map((r: any) => r.created_date),
      status: g.keep.final_status,
    }));

    if (mode === 'scan') {
      return Response.json({
        success: true,
        mode,
        total_leads: all.length,
        duplicate_groups: groups.length,
        records_to_remove: duplicateCount,
        would_remain: all.length - duplicateCount,
        sample,
      });
    }

    // APPLY: merge anything the keeper is missing, then delete the copy.
    let merged = 0;
    let deleted = 0;
    const failures: string[] = [];

    for (const g of groups) {
      const patch: Record<string, unknown> = {};
      for (const dupe of g.remove) {
        for (const f of MERGEABLE) {
          if (isEmpty(g.keep[f]) && !isEmpty(dupe[f]) && isEmpty(patch[f])) {
            patch[f] = dupe[f];
          }
        }
      }
      if (Object.keys(patch).length > 0) {
        try {
          await base44.asServiceRole.entities.Lead.update(g.keep.id, patch);
          merged += 1;
        } catch (e) {
          failures.push(`merge ${g.keep.id}: ${(e as Error).message}`);
          // Do not delete the copies if the merge failed, or data is lost.
          continue;
        }
      }
      for (const dupe of g.remove) {
        try {
          // Archive rather than hard delete. A duplicate can always be restored
          // if the match turns out to be wrong; a deleted lead cannot. Every
          // reporting query already excludes archived records, so the counts
          // correct immediately either way.
          await base44.asServiceRole.entities.Lead.update(dupe.id, {
            archived: true,
            archived_reason: 'duplicate_scan',
          });
          deleted += 1;
        } catch (e) {
          failures.push(`archive ${dupe.id}: ${(e as Error).message}`);
        }
      }
    }

    return Response.json({
      success: true,
      mode,
      total_leads_before: all.length,
      duplicate_groups: groups.length,
      records_deleted: deleted,
      keepers_enriched: merged,
      remaining: all.length - deleted,
      failures: failures.slice(0, 20),
      failure_count: failures.length,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
