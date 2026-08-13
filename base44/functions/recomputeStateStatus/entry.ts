import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// The 50 US state codes. StateStatus is only ever built for these.
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

// Strict tier priority. Law Firms and Aggregators deliberately outrank
// Networks. A null / unclassified client_type never wins.
const TIER_ORDER = ['Law Firm', 'Aggregator', 'Reseller', 'Network'];

// Page through an entity list so large tables are fully loaded.
async function loadAll(entity, filter) {
  const pageSize = 500;
  const out = [];
  let skip = 0;
  // filter() when a filter object is supplied, otherwise list().
  while (true) {
    const batch = filter
      ? await entity.filter(filter, '-created_date', pageSize, skip)
      : await entity.list('-created_date', pageSize, skip);
    out.push(...batch);
    if (batch.length < pageSize) break;
    skip += pageSize;
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const requestedVertical = body && typeof body.vertical === 'string' && body.vertical.trim()
      ? body.vertical.trim()
      : null;

    // Optional stamps carried onto every StateChangeEvent this run writes.
    // Both default to null and never affect change detection or upserts.
    const triggeredByBuyerId = body && typeof body.triggered_by_buyer_id === 'string' && body.triggered_by_buyer_id
      ? body.triggered_by_buyer_id
      : null;
    const triggeredByUserId = body && typeof body.triggered_by_user_id === 'string' && body.triggered_by_user_id
      ? body.triggered_by_user_id
      : (user && user.id ? user.id : null);

    // When false, StateStatus is upserted exactly as normal but no
    // StateChangeEvent rows are written. Lets a backfill or repair run happen
    // without generating a wave of supplier notifications. Defaults to true.
    const emitEvents = body && body.emit_events === false ? false : true;

    const svc = base44.asServiceRole.entities;

    // Load buyers once and index by id. Only active-status buyers can ever
    // contribute a candidate; keep the full map so we can read client_type.
    const buyers = await loadAll(svc.Buyer);
    const buyerById = {};
    for (const b of buyers) buyerById[b.id] = b;

    // Load BuyerStateCpl rows, optionally scoped to one vertical.
    const cplRows = await loadAll(
      svc.BuyerStateCpl,
      requestedVertical ? { vertical: requestedVertical } : undefined,
    );

    // Determine the set of verticals to recompute.
    let verticals;
    if (requestedVertical) {
      verticals = [requestedVertical];
    } else {
      const set = new Set();
      for (const row of cplRows) {
        if (row.vertical) set.add(row.vertical);
      }
      verticals = Array.from(set);
    }

    // Load existing StateStatus rows for the verticals in scope, indexed by
    // vertical|state so upserts never create duplicates.
    const existingByKey = {};
    for (const v of verticals) {
      const rows = await loadAll(svc.StateStatus, { vertical: v });
      for (const r of rows) existingByKey[`${r.vertical}|${r.state}`] = r;
    }

    // Group candidate CPL rows by vertical|state. A candidate is an active
    // BuyerStateCpl row whose parent Buyer has status active.
    const candidatesByKey = {};
    for (const row of cplRows) {
      if (row.active !== true) continue;
      if (!row.vertical || !row.state) continue;
      const buyer = buyerById[row.buyer_id];
      if (!buyer || buyer.status !== 'active') continue;
      const key = `${row.vertical}|${row.state.toUpperCase()}`;
      (candidatesByKey[key] = candidatesByKey[key] || []).push({ row, buyer });
    }

    const summary = { created: 0, updated: 0, unchanged: 0, events_written: 0, changes: [] };

    for (const vertical of verticals) {
      for (const state of US_STATES) {
        const key = `${vertical}|${state}`;
        const candidates = candidatesByKey[key] || [];
        const existing = existingByKey[key] || null;

        // Compute the target values for this vertical/state.
        let target;
        if (candidates.length === 0) {
          target = {
            active: false,
            effective_client_type: null,
            highest_cpl: 0,
            lowest_cpl: 0,
            active_buyer_count: 0,
          };
        } else {
          // Resolve effective_client_type by strict tier priority.
          let effectiveTier = null;
          for (const tier of TIER_ORDER) {
            if (candidates.some((c) => c.buyer.client_type === tier)) {
              effectiveTier = tier;
              break;
            }
          }

          // CPL range across the entire candidate set.
          const cpls = candidates
            .map((c) => Number(c.row.cpl))
            .filter((n) => Number.isFinite(n));
          const highest = cpls.length ? Math.max(...cpls) : 0;
          const lowest = cpls.length ? Math.min(...cpls) : 0;

          // Distinct buyer_id count.
          const distinctBuyers = new Set(candidates.map((c) => c.row.buyer_id));

          target = {
            active: true,
            effective_client_type: effectiveTier,
            highest_cpl: highest,
            lowest_cpl: lowest,
            active_buyer_count: distinctBuyers.size,
          };
        }

        // Change detection against the existing row.
        const prevActive = existing ? existing.active === true : false;
        const prevType = existing ? (existing.effective_client_type ?? null) : null;
        const prevHigh = existing ? Number(existing.highest_cpl ?? 0) : 0;
        const prevLow = existing ? Number(existing.lowest_cpl ?? 0) : 0;

        let direction = null;
        if (!prevActive && target.active) {
          direction = 'opened';
        } else if (prevActive && !target.active) {
          direction = 'closed';
        } else if (prevActive && target.active) {
          if (
            prevType !== target.effective_client_type ||
            prevHigh !== target.highest_cpl ||
            prevLow !== target.lowest_cpl
          ) {
            direction = 'repriced';
          }
        }

        // Also detect a data change while inactive (e.g. counts), so we keep the
        // row's stored values correct without touching change markers.
        const valuesChanged = !existing ||
          prevActive !== target.active ||
          prevType !== target.effective_client_type ||
          prevHigh !== target.highest_cpl ||
          prevLow !== target.lowest_cpl ||
          Number(existing.active_buyer_count ?? 0) !== target.active_buyer_count;

        if (!valuesChanged && !direction) {
          // Nothing changed: leave the row exactly as it is, no write.
          summary.unchanged += 1;
          continue;
        }

        const writeData = {
          vertical,
          state,
          active: target.active,
          effective_client_type: target.effective_client_type,
          highest_cpl: target.highest_cpl,
          lowest_cpl: target.lowest_cpl,
          active_buyer_count: target.active_buyer_count,
        };

        // Only stamp change markers when a real transition happened. This same
        // guard drives whether a StateChangeEvent is written, so a run with no
        // underlying data change produces zero events and the notifier stays
        // quiet: idempotency is preserved exactly as before.
        if (direction) {
          writeData.last_change_direction = direction;
          writeData.last_changed_at = new Date().toISOString();
          summary.changes.push({
            vertical,
            state,
            direction,
            old_effective_client_type: prevType,
            new_effective_client_type: target.effective_client_type,
          });

          if (emitEvents) {
            await svc.StateChangeEvent.create({
              vertical,
              state,
              direction,
              old_client_type: prevType,
              new_client_type: target.effective_client_type,
              old_cpl: prevHigh,
              new_cpl: target.highest_cpl,
              triggered_by_buyer_id: triggeredByBuyerId,
              triggered_by_user_id: triggeredByUserId,
              notified_supplier_ids: [],
              notification_status: null,
              notified_at: null,
            });
            summary.events_written += 1;
          }
        }

        if (existing) {
          await svc.StateStatus.update(existing.id, writeData);
          summary.updated += 1;
          existingByKey[key] = { ...existing, ...writeData };
        } else {
          const created = await svc.StateStatus.create(writeData);
          summary.created += 1;
          existingByKey[key] = created;
        }
      }
    }

    return Response.json({ status: 'ok', ...summary });
  } catch (error) {
    // Partial run: whatever was written stays written. Report the error.
    return Response.json({ status: 'error', error: error.message }, { status: 500 });
  }
});