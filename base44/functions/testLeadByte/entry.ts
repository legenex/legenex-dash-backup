import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Caller model: operator-only. Fires an outbound POST to an operator-configured
// LeadByte destination using operator credentials, so it must be gated to
// operators BEFORE any service-role read. Portal (buyer/supplier) accounts and
// unauthenticated callers are rejected.
const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];

async function assertOperator(base44, user) {
  const record = await base44.asServiceRole.entities.User.get(user.id).catch(() => null);
  const caller = record || user;
  if (caller.base_role === 'supplier' || caller.base_role === 'buyer') return false;
  if (caller.linked_buyer_id || caller.linked_supplier_id) return false;
  let permissions = {};
  try {
    permissions = typeof caller.permissions === 'string'
      ? JSON.parse(caller.permissions || '{}')
      : (caller.permissions || {});
  } catch { permissions = {}; }
  return caller.role === 'admin' || OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let user = null;
  try { user = await base44.auth.me(); } catch { user = null; }
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await assertOperator(base44, user))) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { connector_id, test_payload } = body;

  const connectors = await base44.asServiceRole.entities.LeadByteConnector.filter({ id: connector_id });
  if (!connectors.length) return Response.json({ error: 'Connector not found' }, { status: 404 });
  const conn = connectors[0];

  const headerRows = typeof conn.headers === 'string' ? JSON.parse(conn.headers || '[]') : (conn.headers || []);
  const headers = {};
  if (Array.isArray(headerRows)) {
    headerRows.forEach(row => { if (row.key) headers[row.key] = row.value; });
  } else {
    Object.assign(headers, headerRows);
  }

  const contentType = conn.content_type || 'application/json';
  headers['Content-Type'] = contentType;

  let bodyStr;
  if (contentType === 'application/x-www-form-urlencoded') {
    bodyStr = new URLSearchParams(test_payload || {}).toString();
  } else {
    bodyStr = JSON.stringify(test_payload || {});
  }

  try {
    const resp = await fetch(conn.target_url, {
      method: conn.http_method || 'POST',
      headers,
      body: bodyStr,
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return Response.json({ status: resp.status, response: data });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 200 });
  }
});