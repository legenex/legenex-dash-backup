import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Authenticated buyer-portal write endpoint. Handles two actions, both strictly
// scoped to the caller's buyer_id:
//   - request_return: create a ReturnRequest for one of the buyer's own leads.
//   - add_feedback:   create a manual BuyerFeedback record for one of the buyer's leads.

async function resolveBuyerScope(user: any, requestedBuyerId: string | null) {
  const isOperator = user.role === 'admin';
  if (isOperator && requestedBuyerId) return requestedBuyerId;
  if (user.linked_buyer_id) return user.linked_buyer_id;
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const buyerId = await resolveBuyerScope(user, body.buyer_id || null);
    if (!buyerId) return Response.json({ error: 'No buyer linked to this account' }, { status: 403 });

    const buyer = await base44.asServiceRole.entities.Buyer.get(buyerId).catch(() => null);
    if (!buyer) return Response.json({ error: 'Buyer not found' }, { status: 404 });
    if (!buyer.portal_enabled && user.role !== 'admin') {
      return Response.json({ error: 'Portal is not enabled for this buyer' }, { status: 403 });
    }

    const action = body.action;

    // Validate that a referenced lead actually belongs to this buyer.
    async function assertOwnLead(leadId: string) {
      if (!leadId) return null;
      const lead = await base44.asServiceRole.entities.Lead.get(leadId).catch(() => null);
      if (!lead || lead.buyer_id !== buyerId) {
        throw new Error('Lead not found for this buyer');
      }
      return lead;
    }

    if (action === 'request_return') {
      await assertOwnLead(body.lead_id);
      const created = await base44.asServiceRole.entities.ReturnRequest.create({
        lead_id: body.lead_id,
        buyer_id: buyerId,
        reason: String(body.reason || ''),
        status: 'requested',
        requested_date: new Date().toISOString(),
      });
      return Response.json({ status: 'ok', id: created.id });
    }

    if (action === 'add_feedback') {
      const lead = await assertOwnLead(body.lead_id);
      const disposition = String(body.disposition || '').trim();
      if (!disposition) return Response.json({ error: 'Disposition is required' }, { status: 400 });

      const created = await base44.asServiceRole.entities.BuyerFeedback.create({
        lead_id: body.lead_id || null,
        buyer_id: buyerId,
        matched_by: 'manual',
        disposition,
        raw_disposition: disposition,
        notes: String(body.notes || ''),
        outcome: String(body.outcome || ''),
        revenue_value: Number(body.revenue_value) || 0,
        source: 'manual',
        match_confidence: 1,
      });

      // Stamp disposition on the lead for operator reporting.
      if (lead) {
        await base44.asServiceRole.entities.Lead.update(lead.id, { buyer_feedback: disposition });
      }
      return Response.json({ status: 'ok', id: created.id });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});