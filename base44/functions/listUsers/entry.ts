import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Returns every User record for this app using the service role, bypassing the
// row-level security that scopes base44.entities.User.list() to the caller.
// Admin-gated: only admins may enumerate all users.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const all = await base44.asServiceRole.entities.User.list();
    const users = (all || []).map((u) => ({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      role: u.role,
      base_role: u.base_role,
      permissions: u.permissions,
      created_date: u.created_date,
      linked_buyer_id: u.linked_buyer_id,
      linked_supplier_id: u.linked_supplier_id,
      status: 'active',
    }));

    // Merge pending invitations: anyone invited but not yet a real User shows as
    // "pending". Skip invites whose email already has a User record (they joined).
    const existingEmails = new Set(users.map((u) => (u.email || '').toLowerCase()));
    let pending = [];
    try {
      const invites = await base44.asServiceRole.entities.Invitation.filter({ status: 'pending' });
      pending = (invites || [])
        .filter((inv) => inv.email && !existingEmails.has(inv.email.toLowerCase()))
        .map((inv) => ({
          id: `invite_${inv.id}`,
          invitation_id: inv.id,
          full_name: null,
          email: inv.email,
          role: inv.role,
          base_role: inv.base_role,
          permissions: inv.permissions,
          created_date: inv.created_date,
          status: 'pending',
        }));
    } catch {
      // Invitation entity may not exist yet — ignore.
    }

    return Response.json({ users: [...users, ...pending] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});