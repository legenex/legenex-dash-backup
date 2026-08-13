import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Sends a WhatsApp text message via the WhatsApp Business Cloud API.
// Credentials (access_token + phone_number_id) are stored in the IntegrationConfig entity.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const to = body?.to;
    const text = body?.body;
    if (!to || !text) return Response.json({ error: 'to and body are required' }, { status: 400 });

    const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ name: 'whatsapp' });
    const cfg = configs[0];
    if (!cfg) return Response.json({ error: 'WhatsApp is not configured. Add your API credentials first.' }, { status: 400 });

    let parsed = {};
    try { parsed = JSON.parse(cfg.config || '{}'); } catch {}
    const accessToken = parsed.access_token;
    const phoneNumberId = parsed.phone_number_id;
    if (!accessToken || !phoneNumberId) {
      return Response.json({ error: 'Missing access_token or phone_number_id in WhatsApp config' }, { status: 400 });
    }

    const apiRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: String(to).replace(/\D/g, ''),
        type: 'text',
        text: { body: text },
      }),
    });

    const data = await apiRes.json();
    if (!apiRes.ok) {
      const msg = data?.error?.message || 'WhatsApp send failed';
      return Response.json({ error: msg, details: data }, { status: 502 });
    }
    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});