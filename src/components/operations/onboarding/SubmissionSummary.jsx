import React from 'react';

// Read only render of the key fields from form_payload in a readable layout.
// Nothing here writes.

function Field({ label, value }) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[13px] text-foreground mt-0.5 break-words">{String(value)}</div>
    </div>
  );
}

function Group({ title, children }) {
  // Hide a group whose fields all rendered nothing.
  const hasContent = React.Children.toArray(children).some(Boolean);
  if (!hasContent) return null;
  return (
    <div>
      <div className="text-[12px] font-semibold text-foreground mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}

function Quote({ label, value }) {
  if (!value || String(value).trim() === '') return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <blockquote className="border-l-2 border-border pl-3 text-[13px] text-muted-foreground italic whitespace-pre-wrap">
        {String(value)}
      </blockquote>
    </div>
  );
}

// Normalise a value that might be a JSON array string or an array into a list.
function toList(value) {
  if (Array.isArray(value)) return value.filter((v) => String(v).trim() !== '');
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v) => String(v).trim() !== '');
    } catch { /* fall through */ }
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export default function SubmissionSummary({ payload }) {
  const p = payload || {};
  const states = toList(p.target_states);
  const outboundPhones = toList(p.tcpa_outbound_phones);

  return (
    <div className="space-y-6">
      <Group title="Company">
        <Field label="Company name" value={p.company_name} />
        <Field label="Vertical" value={p.vertical} />
        <Field label="Client type" value={p.client_type} />
        <Field label="CPL" value={p.cpl !== undefined && p.cpl !== '' ? `$${p.cpl}` : ''} />
        <Field label="Billing type" value={p.billing_type} />
        <Field label="Delivery method" value={p.delivery_method} />
        <Field label="Disposition method" value={toList(p.disposition_method).join(', ')} />
        <Field label="Initial batch size" value={p.initial_batch_size} />
      </Group>

      {states.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Target states</div>
          <div className="flex flex-wrap gap-1.5">
            {states.map((s) => (
              <span key={s} className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      <Group title="Primary contact">
        <Field label="Name" value={p.primary_contact_name} />
        <Field label="Email" value={p.primary_contact_email} />
        <Field label="Phone" value={p.primary_contact_phone} />
      </Group>

      <Group title="Secondary contact">
        <Field label="Name" value={p.secondary_contact_name} />
        <Field label="Role" value={p.secondary_contact_role} />
        <Field label="Email" value={p.secondary_contact_email} />
        <Field label="Phone" value={p.secondary_contact_phone} />
      </Group>

      <Group title="TCPA contacts">
        <Field label="Inbound phone" value={p.tcpa_inbound_phone} />
        <Field label="Outbound phones" value={outboundPhones.join(', ')} />
        <Field label="Inbound email" value={p.tcpa_inbound_email} />
        <Field label="Outbound email" value={p.tcpa_outbound_email} />
        <Field label="Reply to email" value={p.tcpa_reply_to_email} />
      </Group>

      <Group title="Billing and accounts">
        <Field label="Billing address" value={p.billing_address} />
        <Field label="Billing email" value={p.billing_email} />
        <Field label="Accounts contact" value={p.accounts_contact_name} />
        <Field label="Accounts email" value={p.accounts_email} />
      </Group>

      <div className="space-y-4">
        <Quote label="Prior lead generation experience" value={p.prior_experience} />
        <Quote label="Experience detail" value={p.experience_detail} />
        <Quote label="Additional requirements" value={p.additional_requirements} />
      </div>
    </div>
  );
}