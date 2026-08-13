import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Debounce window: events younger than this are left for the next run so a
// burst of operator edits collapses into a single digest.
const DEBOUNCE_MS = 5 * 60 * 1000;

// Page through an entity list so large tables are fully loaded.
async function loadAll(entity, filter) {
  const pageSize = 500;
  const out = [];
  let skip = 0;
  while (true) {
    const batch = filter
      ? await entity.filter(filter, '-created_date', pageSize, skip)
      : await entity.list('-created_date', pageSize, skip);
    out.push(...batch);
    if (batch.length < pageSize) break;
    skip += pageSize;
  }
  return out;
}

// Build one plain-text digest body from the eligible events, grouped by
// direction: opened first, then closed, then repriced.
function buildDigestBody(events) {
  const groups = { opened: [], closed: [], repriced: [] };
  for (const ev of events) {
    if (groups[ev.direction]) groups[ev.direction].push(ev);
  }

  const lines = [];
  const section = (title, list, formatter) => {
    if (!list.length) return;
    lines.push(title);
    for (const ev of list) lines.push('  ' + formatter(ev));
    lines.push('');
  };

  section('Opened', groups.opened, (ev) => `${ev.vertical} ${ev.state}`);
  section('Closed', groups.closed, (ev) => `${ev.vertical} ${ev.state}`);
  section('Repriced', groups.repriced, (ev) => {
    const oldCpl = ev.old_cpl == null ? 'n/a' : ev.old_cpl;
    const newCpl = ev.new_cpl == null ? 'n/a' : ev.new_cpl;
    return `${ev.vertical} ${ev.state} CPL ${oldCpl} to ${newCpl}`;
  });

  return lines.join('\n').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const svc = base44.asServiceRole.entities;
    const now = Date.now();

    // 1. Eligible events: not notified yet and at least DEBOUNCE_MS old.
    const pending = await loadAll(svc.StateChangeEvent, { notified_at: null });
    const events = pending.filter((ev) => {
      const created = ev.created_date ? new Date(ev.created_date).getTime() : now;
      return now - created >= DEBOUNCE_MS;
    });

    const emptySummary = {
      events_processed: 0,
      suppliers_notified: 0,
      suppliers_unconfigured: 0,
      channels: {
        email: { sent: 0, failed: 0 },
        slack: { sent: 0, failed: 0 },
        whatsapp: { sent: 0, failed: 0 },
      },
    };

    if (events.length === 0) {
      return Response.json({ status: 'ok', ...emptySummary });
    }

    // 2. Recipients: active suppliers that have not opted out. Missing/null
    // notify_on_state_change counts as opted in (predates the field).
    const activeSuppliers = await loadAll(svc.Supplier, { status: 'active' });
    const recipients = activeSuppliers.filter((s) => s.notify_on_state_change !== false);

    // 3. One digest body shared by every recipient this run.
    const digestBody = buildDigestBody(events);
    const subject = `State coverage update: ${events.length} change${events.length === 1 ? '' : 's'}`;

    // Slack config (optional), stored like WhatsApp in IntegrationConfig.
    let slackToken = '';
    try {
      const slackCfgs = await svc.IntegrationConfig.filter({ name: 'slack' });
      if (slackCfgs[0]) {
        const parsed = JSON.parse(slackCfgs[0].config || '{}');
        slackToken = parsed.bot_token || parsed.access_token || '';
      }
    } catch { /* no slack config */ }

    // Per channel run totals.
    const channels = {
      email: { sent: 0, failed: 0, errors: [] },
      slack: { sent: 0, failed: 0, errors: [] },
      whatsapp: { sent: 0, failed: 0, errors: [] },
    };

    const notifiedSupplierIds = [];
    let suppliersUnconfigured = 0;

    for (const supplier of recipients) {
      const hasEmail = !!(supplier.notify_email && String(supplier.notify_email).trim());
      const hasSlack = !!(supplier.notify_slack_channel && String(supplier.notify_slack_channel).trim());
      const hasWhatsapp = !!(supplier.notify_whatsapp && String(supplier.notify_whatsapp).trim());

      if (!hasEmail && !hasSlack && !hasWhatsapp) {
        suppliersUnconfigured += 1;
        continue;
      }

      let reachedOnce = false;

      // Email via sendGmail.
      if (hasEmail) {
        try {
          const res = await base44.functions.invoke('sendGmail', {
            to: supplier.notify_email,
            subject,
            body: digestBody,
          });
          if (res?.data?.success) {
            channels.email.sent += 1;
            reachedOnce = true;
          } else {
            channels.email.failed += 1;
            channels.email.errors.push(`${supplier.id}: ${res?.data?.error || 'send failed'}`);
          }
        } catch (e) {
          channels.email.failed += 1;
          channels.email.errors.push(`${supplier.id}: ${e.message}`);
        }
      }

      // Slack via chat.postMessage using the stored bot token.
      if (hasSlack) {
        try {
          if (!slackToken) throw new Error('Slack is not configured');
          const apiRes = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${slackToken}`,
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({
              channel: supplier.notify_slack_channel,
              text: `${subject}\n\n${digestBody}`,
            }),
          });
          const data = await apiRes.json().catch(() => ({}));
          if (apiRes.ok && data.ok) {
            channels.slack.sent += 1;
            reachedOnce = true;
          } else {
            channels.slack.failed += 1;
            channels.slack.errors.push(`${supplier.id}: ${data.error || `HTTP ${apiRes.status}`}`);
          }
        } catch (e) {
          channels.slack.failed += 1;
          channels.slack.errors.push(`${supplier.id}: ${e.message}`);
        }
      }

      // WhatsApp via sendWhatsapp.
      if (hasWhatsapp) {
        try {
          const res = await base44.functions.invoke('sendWhatsapp', {
            to: supplier.notify_whatsapp,
            body: `${subject}\n\n${digestBody}`,
          });
          if (res?.data?.success) {
            channels.whatsapp.sent += 1;
            reachedOnce = true;
          } else {
            channels.whatsapp.failed += 1;
            channels.whatsapp.errors.push(`${supplier.id}: ${res?.data?.error || 'send failed'}`);
          }
        } catch (e) {
          channels.whatsapp.failed += 1;
          channels.whatsapp.errors.push(`${supplier.id}: ${e.message}`);
        }
      }

      if (reachedOnce) notifiedSupplierIds.push(supplier.id);
    }

    // 4. Stamp every processed event so a second run never resends. Record the
    // per channel outcome, including failures, so they stay visible.
    const notificationStatus = {
      email: { sent: channels.email.sent, failed: channels.email.failed, errors: channels.email.errors },
      slack: { sent: channels.slack.sent, failed: channels.slack.failed, errors: channels.slack.errors },
      whatsapp: { sent: channels.whatsapp.sent, failed: channels.whatsapp.failed, errors: channels.whatsapp.errors },
    };
    const notifiedAt = new Date().toISOString();

    for (const ev of events) {
      await svc.StateChangeEvent.update(ev.id, {
        notified_at: notifiedAt,
        notified_supplier_ids: notifiedSupplierIds,
        notification_status: notificationStatus,
      });
    }

    return Response.json({
      status: 'ok',
      events_processed: events.length,
      suppliers_notified: notifiedSupplierIds.length,
      suppliers_unconfigured: suppliersUnconfigured,
      channels: {
        email: { sent: channels.email.sent, failed: channels.email.failed },
        slack: { sent: channels.slack.sent, failed: channels.slack.failed },
        whatsapp: { sent: channels.whatsapp.sent, failed: channels.whatsapp.failed },
      },
    });
  } catch (error) {
    return Response.json({ status: 'error', error: error.message }, { status: 500 });
  }
});