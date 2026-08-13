import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Records a pending Invitation row (app-owned entity) so an invited person is
// visible in Settings > Users and Roles as "Pending" before they accept and log
// in. Base44 does not let apps insert User records directly (they get reaped),
// so we track the invite in our own Invitation entity instead. Admin-gated.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (caller.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { email, base_role, permissions, role } = await req.json();
    if (!email) return Response.json({ error: 'email is required' }, { status: 400 });

    // Upsert: reuse an existing pending/cancelled invite for this email.
    const existing = await base44.asServiceRole.entities.Invitation.filter({ email });
    let invitation;
    const payload = { email, role, base_role, permissions, status: 'pending', invited_by: caller.email };
    if (existing && existing[0]) {
      invitation = await base44.asServiceRole.entities.Invitation.update(existing[0].id, payload);
    } else {
      invitation = await base44.asServiceRole.entities.Invitation.create(payload);
    }

    return Response.json({ invitation });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});