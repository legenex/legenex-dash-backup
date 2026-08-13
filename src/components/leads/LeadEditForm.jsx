import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invalidateLeadCaches } from '@/lib/leadCaches';

// Direct (top-level) lead columns the operator can edit, grouped for scanning.
const FIELD_GROUPS = [
  {
    title: 'Contact',
    fields: [
      ['first_name', 'First Name'],
      ['last_name', 'Last Name'],
      ['mobile', 'Mobile'],
      ['email', 'Email'],
    ],
  },
  {
    title: 'Attribution',
    fields: [
      ['supplier_name', 'Supplier'],
      ['buyer_feedback', 'Buyer Feedback'],
      ['revenue', 'Revenue', 'number'],
      ['conv_value', 'Conversion Value', 'number'],
    ],
  },
  {
    title: 'Status',
    fields: [
      ['final_status', 'Final Status'],
      ['queue_reason', 'Queue Reason'],
      ['email_valid', 'Email Valid'],
    ],
  },
  {
    title: 'Verification',
    fields: [
      ['hlr_status', 'HLR Status'],
      ['hlr_summary_score', 'HLR Score', 'number'],
      ['leadbyte_record_status', 'LeadByte Status'],
      ['leadbyte_lead_id', 'LeadByte Lead ID', 'number'],
      ['leadbyte_queue_id', 'Queue ID'],
    ],
  },
];

const ALL_DIRECT_KEYS = FIELD_GROUPS.flatMap(g => g.fields.map(f => f[0]));

export default function LeadEditForm({ lead, onSaved, onCancel }) {
  const qc = useQueryClient();
  const [direct, setDirect] = useState({});
  const [mapped, setMapped] = useState({});
  const [saving, setSaving] = useState(false);

  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list(),
  });

  useEffect(() => {
    const d = {};
    for (const k of ALL_DIRECT_KEYS) d[k] = lead[k] != null ? String(lead[k]) : '';
    setDirect(d);
    let mf = {};
    try { mf = JSON.parse(lead.mapped_fields || '{}'); } catch {}
    setMapped(mf);
  }, [lead]);

  const numberKeys = new Set(
    FIELD_GROUPS.flatMap(g => g.fields.filter(f => f[2] === 'number').map(f => f[0]))
  );

  const setMappedVal = (key, val) => setMapped(p => ({ ...p, [key]: val }));

  // Order the mapped fields: known custom fields first (by their config order),
  // then any extra keys present on the lead that aren't defined as custom fields.
  const cfKeys = customFields.map(f => f.field_name);
  const extraKeys = Object.keys(mapped).filter(k => !cfKeys.includes(k));
  const mappedEntries = [
    ...customFields.filter(f => f.field_type !== 'system').map(f => [f.field_name, f.label || f.field_name]),
    ...extraKeys.map(k => [k, k]),
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      const update = {};
      for (const k of ALL_DIRECT_KEYS) {
        const raw = direct[k];
        if (numberKeys.has(k)) {
          update[k] = raw === '' ? null : Number(raw);
        } else {
          update[k] = raw;
        }
      }
      update.mapped_fields = JSON.stringify(mapped);

      // Patch raw_payload so Resend replays edited values. Only inbound data is
      // merged: the four contact keys plus every mapped field (utm_source, s1,
      // sid, etc). Pipeline outputs are never written into the inbound payload.
      let patchedPayload = {};
      try { patchedPayload = JSON.parse(lead.raw_payload || '{}'); } catch { patchedPayload = {}; }
      for (const k of ['first_name', 'last_name', 'mobile', 'email']) {
        patchedPayload[k] = direct[k];
      }
      for (const [k, v] of Object.entries(mapped)) {
        patchedPayload[k] = v;
      }
      update.raw_payload = JSON.stringify(patchedPayload);

      await base44.entities.Lead.update(lead.id, update);
      toast.success('Lead updated');
      invalidateLeadCaches(qc);
      onSaved?.();
    } catch {
      toast.error('Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="max-h-[52vh] overflow-y-auto pr-1 space-y-5">
        {FIELD_GROUPS.map(group => (
          <div key={group.title}>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.title}</div>
            <div className="grid grid-cols-2 gap-3">
              {group.fields.map(([key, label, type]) => (
                <div key={key}>
                  <Label className="text-[12px] text-muted-foreground">{label}</Label>
                  <Input
                    type={type === 'number' ? 'number' : 'text'}
                    value={direct[key] ?? ''}
                    onChange={e => setDirect(p => ({ ...p, [key]: e.target.value }))}
                    className="mt-1 bg-background"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {mappedEntries.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Lead Fields</div>
            <div className="grid grid-cols-2 gap-3">
              {mappedEntries.map(([key, label]) => (
                <div key={key}>
                  <Label className="text-[12px] text-muted-foreground">{label}</Label>
                  <Input
                    value={mapped[key] != null ? String(mapped[key]) : ''}
                    onChange={e => setMappedVal(key, e.target.value)}
                    className="mt-1 bg-background font-mono text-[12px]"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-3 border-t border-border">
        <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}