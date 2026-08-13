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

// Operator only. Read only. Lists the Meta Pages a connection can see and the
// leadgen forms on each Page, so the Lead Forms tab can map a form to a
// Legenex campaign and source. Lead forms live on Pages, not ad accounts, and
// require the pages_show_list and leads_retrieval scopes plus a Page access
// token, so this reports a clear needs_reconnect signal when the scopes are
// missing rather than failing silently.
// Payload: { connection_id: string }
// Returns { success, pages: [{ id, name, forms: [...], error? }], needs_reconnect, error }
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
    if (!conn || !conn.token) return Response.json({ error: 'Connection not found or has no token' }, { status: 404 });

    const ver = 'v21.0';

    // 1) Pages this token can see, with their page access tokens.
    const pagesUrl = `https://graph.facebook.com/${ver}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(conn.token)}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesJson = await pagesRes.json();
    if (pagesJson.error) {
      const code = pagesJson.error.code;
      const msg = pagesJson.error.error_user_msg || pagesJson.error.message || 'Could not load Pages';
      const scopeIssue = code === 200 || code === 10 || /permission|scope/i.test(String(msg));
      return Response.json({
        success: false,
        needs_reconnect: !!scopeIssue,
        error: scopeIssue
          ? 'This connection cannot read Pages. Reconnect Meta and grant the Pages and lead access permissions (pages_show_list, leads_retrieval).'
          : msg,
        meta_code: code || null,
      });
    }

    const rawPages: any[] = Array.isArray(pagesJson.data) ? pagesJson.data : [];
    if (!rawPages.length) {
      return Response.json({
        success: true,
        pages: [],
        needs_reconnect: true,
        error: 'No Pages are visible to this connection. Reconnect Meta and grant access to the Pages that own your lead forms.',
      });
    }

    // 2) Leadgen forms per Page, using the Page token when Meta returns one.
    const pages: any[] = [];
    for (const p of rawPages.slice(0, 50)) {
      const pageToken = p.access_token || conn.token;
      const entry: any = { id: p.id, name: p.name || p.id, forms: [] };
      try {
        let url = `https://graph.facebook.com/${ver}/${p.id}/leadgen_forms?fields=id,name,status,leads_count,created_time&limit=100&access_token=${encodeURIComponent(pageToken)}`;
        let guard = 0;
        while (url && guard < 5) {
          const r = await fetch(url);
          const j = await r.json();
          if (j.error) {
            entry.error = j.error.error_user_msg || j.error.message || 'Could not load forms for this Page';
            break;
          }
          for (const f of j.data || []) {
            entry.forms.push({
              id: f.id,
              name: f.name || f.id,
              status: String(f.status || '').toUpperCase() === 'ACTIVE' ? 'active' : 'paused',
              leads_count: Number(f.leads_count) || 0,
              created_time: f.created_time || '',
            });
          }
          url = j.paging?.next || '';
          guard++;
        }
      } catch (e) {
        entry.error = (e as Error).message;
      }
      entry.forms.sort((a: any, b: any) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
      pages.push(entry);
    }

    const totalForms = pages.reduce((n, p) => n + (p.forms?.length || 0), 0);
    return Response.json({ success: true, pages, total_forms: totalForms, needs_reconnect: false });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
