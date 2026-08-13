import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Cancels (deletes) a pending Invitation row. Admin-gated.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (caller.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { invitation_id } = await req.json();
    if (!invitation_id) return Response.json({ error: 'invitation_id is required' }, { status: 400 });

    await base44.asServiceRole.entities.Invitation.delete(invitation_id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});