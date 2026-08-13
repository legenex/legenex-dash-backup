import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Input, Toggle } from '@/components/settings/settingsUi';

// The four onboarding email events, in render order, with their labels and
// descriptions. The card order follows this list.
const EVENT_META = [
  {
    event: 'invite',
    title: 'Invite link email',
    desc: 'Sent when you press Send on a buyer. Goes to the buyer contact.',
  },
  {
    event: 'submitted',
    title: 'Submitted acknowledgment',
    desc: 'Sent when the client finishes the onboarding form. Goes to the buyer contact.',
  },
  {
    event: 'complete',
    title: 'Onboarding complete',
    desc: 'Sent automatically when provisioning finishes. Goes to the buyer contact.',
  },
  {
    event: 'blocked',
    title: 'Blocked alert (internal)',
    desc: 'Sent to your team when a run stalls. Uses the recipients below.',
  },
];

export default function OnboardingEmailSettings() {
  const qc = useQueryClient();
  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState(null);

  const { data } = useQuery({
    queryKey: ['onboarding-email-templates'],
    queryFn: () => base44.entities.OnboardingEmailTemplate.list(),
  });
  const records = Array.isArray(data) ? data : [];

  // Seed the local edit state from loaded records without clobbering fields the
  // user is currently typing into.
  useEffect(() => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of records) {
        if (!next[r.id]) {
          next[r.id] = {
            subject: r.subject || '',
            body: r.body || '',
            enabled: r.enabled !== false,
            recipients: parseRecipients(r.recipients),
          };
        }
      }
      return next;
    });
  }, [data]);

  const setField = (id, key, value) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const save = async (record) => {
    const e = edits[record.id];
    if (!e) return;
    setSavingId(record.id);
    try {
      const recipients = JSON.stringify(
        (e.recipients || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
      await base44.entities.OnboardingEmailTemplate.update(record.id, {
        subject: e.subject,
        body: e.body,
        enabled: e.enabled,
        recipients,
      });
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['onboarding-email-templates'] });
    } catch (err) {
      toast.error(err?.message || 'Could not save the email template.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-4 text-[12.5px] text-muted-foreground leading-relaxed">
        <div className="font-semibold text-foreground mb-1">Merge fields</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11.5px]">
          <span>{'{{company_name}}'}</span>
          <span>{'{{contact_name}}'}</span>
          <span>{'{{buyer_code}}'}</span>
          <span>{'{{vertical}}'}</span>
          <span>{'{{link}}'} (invite only)</span>
          <span>{'{{failed_step}}'} (blocked only)</span>
        </div>
        <div className="mt-2">
          Client emails send to the buyer contact. The blocked alert uses the recipients field below.
        </div>
      </div>

      {EVENT_META.map((meta) => {
        const record = records.find((r) => r.event === meta.event);
        if (!record) return null;
        const e = edits[record.id] || { subject: '', body: '', enabled: true, recipients: '' };
        return (
          <div key={meta.event} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[14px] font-semibold text-foreground">{meta.title}</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">{meta.desc}</div>
              </div>
              <Toggle checked={e.enabled} onChange={(v) => setField(record.id, 'enabled', v)} />
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <Input
                label="Subject"
                value={e.subject}
                onChange={(v) => setField(record.id, 'subject', v)}
                placeholder="Email subject"
              />

              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Body
                </div>
                <textarea
                  value={e.body}
                  onChange={(ev) => setField(record.id, 'body', ev.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/60 resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Email body"
                />
              </div>

              {meta.event === 'blocked' && (
                <Input
                  label="Recipients"
                  value={e.recipients}
                  onChange={(v) => setField(record.id, 'recipients', v)}
                  placeholder="ops@company.com, alerts@company.com"
                  hint="Comma separated email addresses."
                />
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => save(record)}
                  disabled={savingId === record.id}
                  className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {savingId === record.id ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Recipients are stored as a JSON array string. Turn them back into the comma
// separated string the input edits.
function parseRecipients(value) {
  try {
    const arr = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(arr) ? arr.join(', ') : '';
  } catch {
    return typeof value === 'string' ? value : '';
  }
}