import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// One off Slack test message to a single channel. This is the same posting path
// used by the digest sender (chat.postMessage with the bot token stored in the
// IntegrationConfig entity under name "slack"), isolated here so the drawer can
// fire a real test without touching the digest function.
//
// This never writes a StateChangeEvent, never sets notified_at, and never
// enqueues a digest. It only posts one message.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const channel = String(body.channel || '').trim();
    const text = String(body.body || '').trim();
    if (!channel) return Response.json({ success: false, error: 'channel is required' }, { status: 400 });
    if (!text) return Response.json({ success: false, error: 'body is required' }, { status: 400 });

    let slackToken = '';
    try {
      const cfgs = await base44.asServiceRole.entities.IntegrationConfig.filter({ name: 'slack' });
      if (cfgs[0]) {
        const parsed = JSON.parse(cfgs[0].config || '{}');
        slackToken = parsed.bot_token || parsed.access_token || '';
      }
    } catch { /* no slack config */ }

    if (!slackToken) {
      return Response.json({ success: false, error: 'Slack is not configured. Add your Slack bot token first.' });
    }

    const apiRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${slackToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text }),
    });
    const data = await apiRes.json().catch(() => ({}));
    if (apiRes.ok && data.ok) {
      return Response.json({ success: true, ts: data.ts });
    }
    return Response.json({ success: false, error: data.error || `HTTP ${apiRes.status}` });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});