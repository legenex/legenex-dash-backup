import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Public lead intake endpoint (/functions/leads)
// Delegates the ENTIRE lead-processing pipeline to processLead so there is
// a single source of truth. processLead handles: API-key auth, HLR, custom
// calculations, TrustedForm gate, required-fields gate, LeadByte connector
// filters & field conditions (with DQ routing), revenue capture, Facebook
// CAPI + Deliveries firing on all triggers, duplicate handling, response
// mapping, and outbound webhooks.
//
// This wrapper handles CORS and injects the supplier API key from headers
// into the payload (as _supplier_key) so processLead can find it.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-KEY, X_KEY, Authorization',
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (method === 'GET') return Response.json({ status: 'ok' }, { status: 200, headers: CORS_HEADERS });
  if (method !== 'POST') return Response.json({ Response: 'Error', reason: 'Method not allowed' }, { status: 405, headers: CORS_HEADERS });

  try {
    const body = await req.json();
    const payload = body.payload || body;

    // Extract API key from headers and inject into payload so processLead can authenticate.
    let supplierKeyRaw =
      req.headers.get('X-API-KEY') ||
      req.headers.get('X_KEY') ||
      req.headers.get('x-api-key') ||
      req.headers.get('x_key') ||
      null;
    if (!supplierKeyRaw) {
      const authHeader = req.headers.get('Authorization') || '';
      if (authHeader.startsWith('Basic ')) {
        const decoded = atob(authHeader.slice(6));
        supplierKeyRaw = decoded.split(':')[0] || null;
      }
    }
    if (supplierKeyRaw && !payload._supplier_key) {
      payload._supplier_key = supplierKeyRaw;
    }

    // Delegate to processLead via SDK functions.invoke (not fetch - fetch to
    // /functions/processLead doesn't resolve inside the Deno worker).
    // functions.invoke throws on non-2xx; extract the response body from the error.
    try {
      const result = await base44.asServiceRole.functions.invoke('processLead', payload);
      const data = result?.data !== undefined ? result.data : result;
      return Response.json(data, { status: 200, headers: CORS_HEADERS });
    } catch (invokeErr) {
      // axios-style error: response.data holds the body from processLead
      const errData = invokeErr?.response?.data;
      const errStatus = invokeErr?.response?.status || 200;
      if (errData) {
        return Response.json(errData, { status: errStatus, headers: CORS_HEADERS });
      }
      return Response.json(
        { Response: 'Error', reason: invokeErr?.message || 'Processing failed' },
        { status: 200, headers: CORS_HEADERS }
      );
    }
  } catch (err) {
    return Response.json(
      { Response: 'Error', reason: 'Internal processing error' },
      { status: 200, headers: CORS_HEADERS }
    );
  }
});