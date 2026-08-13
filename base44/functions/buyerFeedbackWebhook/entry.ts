import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Public buyer feedback webhook (/functions/buyerFeedbackWebhook).
// Buyers POST feedback here. We authenticate with a per-buyer feedback token,
// match the lead by phone or email, AI-map the buyer's raw disposition to our
// taxonomy, and persist a BuyerFeedback record (source = webhook).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-BUYER-TOKEN, Authorization',
};

const TAXONOMY = [
  'At Fault', 'Attorney Rejected', 'Already Settled', 'Chase', 'Converted', 'Denied',
  'Do Not Call', 'Duplicate', 'Faux Lead', 'Has Attorney', 'Lost Contact', 'Minor',
  'No Damages', 'New Lead', 'No Contact', 'No Injury', 'No Insurance', 'No Liability',
  'No Treatment', 'Not Interested', 'Other', 'Past SOL', 'Referred', 'Wrong Law Type', 'Wrong Number',
];

function normPhone(v: unknown) {
  return String(v || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
}
function normEmail(v: unknown) {
  return String(v || '').trim().toLowerCase();
}

async function mapDisposition(raw: string): Promise<{ disposition: string; confidence: number }> {
  const exact = TAXONOMY.find(t => t.toLowerCase() === String(raw || '').trim().toLowerCase());
  if (exact) return { disposition: exact, confidence: 1 };

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey || !raw) return { disposition: 'Other', confidence: 0.3 };

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: `Map the buyer's raw lead disposition to the single closest value in this fixed taxonomy. Reply ONLY with JSON {"disposition": "<one taxonomy value>", "confidence": <0-1>}. If nothing fits, use "Other".

Taxonomy: ${TAXONOMY.join(', ')}

Buyer's raw disposition: "${raw}"`,
        }],
      }),
    });
    if (!res.ok) return { disposition: 'Other', confidence: 0.3 };
    const data = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    const disposition = TAXONOMY.includes(parsed.disposition) ? parsed.disposition : 'Other';
    let confidence = Number(parsed.confidence);
    if (isNaN(confidence)) confidence = 0.5;
    confidence = Math.max(0, Math.min(1, confidence));
    return { disposition, confidence };
  } catch {
    return { disposition: 'Other', confidence: 0.3 };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method === 'GET') return Response.json({ status: 'ok' }, { status: 200, headers: CORS_HEADERS });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS_HEADERS });

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Authenticate the buyer by their feedback token (buyer id used as token).
    let token = req.headers.get('X-BUYER-TOKEN') || body.buyer_token || '';
    if (!token) {
      const auth = req.headers.get('Authorization') || '';
      if (auth.startsWith('Bearer ')) token = auth.slice(7);
    }
    if (!token) return Response.json({ error: 'Missing buyer token' }, { status: 401, headers: CORS_HEADERS });

    let buyer: any = null;
    try { buyer = await base44.asServiceRole.entities.Buyer.get(token); } catch { buyer = null; }
    if (!buyer || !buyer.portal_enabled) {
      return Response.json({ error: 'Invalid buyer token or portal disabled' }, { status: 401, headers: CORS_HEADERS });
    }

    const phone = normPhone(body.phone || body.mobile);
    const email = normEmail(body.email);
    if (!phone && !email) {
      return Response.json({ error: 'Provide phone or email to match the lead' }, { status: 400, headers: CORS_HEADERS });
    }

    // Match a lead by phone or email (search a recent window).
    let matchedLead: any = null;
    let matchedBy = '';
    const recent = await base44.asServiceRole.entities.Lead.list('-created_date', 5000);
    for (const l of recent) {
      if (phone && normPhone(l.mobile) && normPhone(l.mobile) === phone) { matchedLead = l; matchedBy = 'phone'; break; }
    }
    if (!matchedLead && email) {
      for (const l of recent) {
        if (email && normEmail(l.email) === email) { matchedLead = l; matchedBy = 'email'; break; }
      }
    }

    const rawDisposition = String(body.disposition || body.raw_disposition || '').trim();
    const { disposition, confidence } = await mapDisposition(rawDisposition);

    const feedback = await base44.asServiceRole.entities.BuyerFeedback.create({
      lead_id: matchedLead?.id || null,
      buyer_id: buyer.id,
      matched_by: matchedBy,
      disposition,
      raw_disposition: rawDisposition,
      notes: String(body.notes || ''),
      outcome: String(body.outcome || ''),
      revenue_value: Number(body.revenue_value) || 0,
      source: 'webhook',
      match_confidence: confidence,
    });

    // Stamp the mapped disposition + buyer onto the matched lead for reporting.
    if (matchedLead) {
      await base44.asServiceRole.entities.Lead.update(matchedLead.id, {
        buyer_feedback: disposition,
        buyer_id: matchedLead.buyer_id || buyer.id,
      });
    }

    return Response.json({
      status: 'ok',
      matched: !!matchedLead,
      matched_by: matchedBy || null,
      disposition,
      match_confidence: confidence,
      feedback_id: feedback.id,
    }, { status: 200, headers: CORS_HEADERS });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS_HEADERS });
  }
});