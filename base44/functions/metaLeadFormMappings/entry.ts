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

// Operator only. CRUD for Meta lead form mappings (form -> Legenex campaign +
// source + field map). Storage only: this function never ingests leads. The
// ingest_mode field defaults to 'disabled' and any mode other than 'disabled'
// is inert until lead ingestion is wired as its own reviewed change.
// Payload: { action: 'list' | 'save' | 'delete', ... }
//   list:   { }                      -> all mappings
//   save:   { form_id, form_name, page_id, page_name, connection_id,
//             campaign_id?, supplier_id?, field_map?, enabled? }
//   delete: { id }
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!isOperator(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const action = String(body.action || 'list');
    const svc = base44.asServiceRole;

    if (action === 'list') {
      const rows = (await svc.entities.MetaLeadFormMapping.filter({ platform: 'meta' })) || [];
      return Response.json({ success: true, mappings: rows });
    }

    if (action === 'delete') {
      const id = String(body.id || '');
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      await svc.entities.MetaLeadFormMapping.delete(id);
      return Response.json({ success: true, deleted: true });
    }

    if (action === 'save') {
      const formId = String(body.form_id || '');
      const pageId = String(body.page_id || '');
      const connectionId = String(body.connection_id || '');
      if (!formId || !pageId || !connectionId) {
        return Response.json({ error: 'form_id, page_id and connection_id are required' }, { status: 400 });
      }

      // Resolve denormalized snapshots so the UI and any later ingestion have
      // stable names even if the source records are renamed.
      let campaignName = '';
      let vertical = '';
      let brand = '';
      if (body.campaign_id) {
        const c = await svc.entities.Campaign.get(String(body.campaign_id)).catch(() => null);
        if (c) { campaignName = c.name || ''; vertical = c.vertical || ''; brand = c.brand || ''; }
      }
      let supplierName = '';
      if (body.supplier_id) {
        const s = await svc.entities.Supplier.get(String(body.supplier_id)).catch(() => null);
        if (s) supplierName = s.name || '';
      }

      let fieldMap = '';
      if (body.field_map != null) {
        fieldMap = typeof body.field_map === 'string' ? body.field_map : JSON.stringify(body.field_map);
      }

      const fields: Record<string, any> = {
        platform: 'meta',
        connection_id: connectionId,
        page_id: pageId,
        page_name: String(body.page_name || ''),
        form_id: formId,
        form_name: String(body.form_name || formId),
        campaign_id: String(body.campaign_id || ''),
        campaign_name: campaignName,
        vertical,
        brand,
        supplier_id: String(body.supplier_id || ''),
        supplier_name: supplierName,
        enabled: body.enabled !== false,
      };
      if (fieldMap) fields.field_map = fieldMap;

      const existing = await svc.entities.MetaLeadFormMapping.filter({ platform: 'meta', form_id: formId });
      if (existing && existing.length) {
        await svc.entities.MetaLeadFormMapping.update(existing[0].id, fields);
        const updated = await svc.entities.MetaLeadFormMapping.get(existing[0].id).catch(() => null);
        return Response.json({ success: true, mapping: updated, created: false });
      }

      // ingest_mode intentionally left at its 'disabled' default on create.
      const created = await svc.entities.MetaLeadFormMapping.create(fields);
      return Response.json({ success: true, mapping: created, created: true });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
