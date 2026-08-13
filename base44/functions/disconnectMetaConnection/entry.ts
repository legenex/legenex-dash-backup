import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const OPERATOR_PERMISSION_KEYS = ['leads', 'reports', 'overview', 'finances', 'distribution', 'operations'];
function isOperator(caller: any): boolean {
  if (!caller) return false;
  if (caller.base_role === 'supplier' || caller.base_role === 'buyer') return false;
  if (caller.linked_buyer_id || caller.linked_supplier_id) return false;
  let permissions: Record<string, any> = {};
  try { permissions = typeof caller.permissions === 'string' ? JSON.parse(caller.permissions || '{}') : (caller.permissions || {}); } catch { permissions = {}; }
  return caller.role === 'admin' || OPERATOR_PERMISSION_KEYS.some((k) => permissions[k] === true);
}

// Operator only. Disconnects a Meta connection: deletes the MetaConnection and,
// by default, its SupplierAdAccount mappings. Historical AdSpend rows are never
// deleted, so past cost and CPL stay intact. The account mappings are removed so
// the scheduled sync stops trying to use the dead token.
// Payload: { connection_id: string, keep_mappings?: boolean }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const connectionId = String(body.connection_id || '');
    if (!connectionId) return Response.json({ error: 'connection_id is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const conn = await svc.entities.MetaConnection.get(connectionId).catch(() => null);
    if (!conn) return Response.json({ error: 'Connection not found' }, { status: 404 });

    let removedMappings = 0;
    if (!body.keep_mappings) {
      const mappings = await svc.entities.SupplierAdAccount.filter({ platform: 'meta', connection_id: connectionId });
      for (const m of mappings) { await svc.entities.SupplierAdAccount.delete(m.id); removedMappings++; }
    }
    await svc.entities.MetaConnection.delete(connectionId);

    return Response.json({ success: true, removed_mappings: removedMappings });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
