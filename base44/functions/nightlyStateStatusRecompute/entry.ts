import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Nightly safety net that repairs drift between StateStatus and the underlying
// Buyer and BuyerStateCpl data.
//
// It calls the existing recomputeStateStatus once per night with
// emit_events: false. That flag is essential here: the nightly repair upserts
// StateStatus exactly as normal but writes no StateChangeEvent rows, so it can
// reconcile drift without generating a wave of supplier digests. This job must
// never send notifications for changes it merely reconciled.
//
// Scheduled once daily in the early morning of the app timezone
// (America/Regina). Returns the recompute summary. recomputeStateStatus is not
// modified; this job only invokes it.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow scheduled (no user) and admin-triggered runs only.
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch {
      // No user: scheduled run, allowed.
    }

    // emit_events: false so the nightly reconcile never sends digests.
    const result = await base44.asServiceRole.functions.invoke('recomputeStateStatus', {
      emit_events: false,
    });
    const data = result?.data !== undefined ? result.data : result;

    return Response.json({ status: 'ok', recompute: data });
  } catch (error) {
    return Response.json({ status: 'error', error: (error as Error).message }, { status: 500 });
  }
});