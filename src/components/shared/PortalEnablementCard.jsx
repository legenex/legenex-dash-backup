import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Link } from 'react-router-dom';
import { AlertTriangle, Send, Loader2 } from 'lucide-react';

// Shared portal-access card for buyers and suppliers. Enabling the portal and
// sending the invite both require a contact name + email on the record. The
// invite goes out via the platform user-invite (role "user").
//
// Props:
//  - record: the buyer/supplier record
//  - entityName: 'Buyer' | 'Supplier'
//  - contactName / contactEmail: resolved values off the record
//  - previewPath: portal preview route (e.g. '/portal?buyer_id=...')
//  - queryKey: react-query key to invalidate after a write
//  - label: 'partner portal' | 'source portal'
export default function PortalEnablementCard({
  record, entityName, contactName, contactEmail, previewPath, queryKey, label = 'partner portal',
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);

  const enabled = !!record.portal_enabled;
  const hasContact = !!(contactName && String(contactName).trim()) && !!(contactEmail && String(contactEmail).trim());

  const toggle = async (next) => {
    if (next && !hasContact) {
      toast.error('Add a contact name and email before enabling the portal.');
      return;
    }
    setSaving(true);
    try {
      await base44.entities[entityName].update(record.id, { portal_enabled: next });
      toast.success(next ? 'Portal access enabled' : 'Portal access disabled');
      qc.invalidateQueries({ queryKey });
    } catch (err) {
      toast.error(`Could not update portal access: ${err?.message || 'error'}`);
    } finally {
      setSaving(false);
    }
  };

  const invite = async () => {
    if (!hasContact) {
      toast.error('Add a contact name and email before sending an invite.');
      return;
    }
    setInviting(true);
    try {
      await base44.users.inviteUser(String(contactEmail).trim(), 'user');
      toast.success(`Invite sent to ${contactEmail}`);
    } catch (err) {
      toast.error(err?.message || 'Could not send invite');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-4">
      {!hasContact && (
        <div className="flex gap-2.5 rounded-lg border border-status-unsold bg-status-unsold p-3">
          <AlertTriangle className="w-4 h-4 status-unsold shrink-0 mt-0.5" />
          <p className="text-[12px] text-foreground/90 leading-relaxed">
            Add a contact name and email above before enabling the {label} and sending an invite.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-[13px] font-medium text-foreground">Portal access</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Let this partner log into the {label}.</p>
        </div>
        <Switch checked={enabled} disabled={saving || !hasContact} onCheckedChange={toggle} />
      </div>

      <Button
        variant="default"
        size="sm"
        className="w-full gap-1.5"
        disabled={!enabled || !hasContact || inviting}
        onClick={invite}
      >
        {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        {inviting ? 'Sending invite...' : `Send invite to ${contactEmail || 'contact'}`}
      </Button>

      {enabled && (
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to={previewPath}>Preview portal</Link>
        </Button>
      )}
    </div>
  );
}