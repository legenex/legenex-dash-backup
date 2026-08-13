import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { PERMISSION_GROUPS, ROLE_PRESETS, sanitizePermissions } from '@/lib/permissions';
import { Panel, Tag, riseIn } from '@/components/settings/settingsUi';

function parsePerms(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

export default function SettingsUsers() {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const [editing, setEditing] = useState(null); // user being edited (or null)
  const [baseRole, setBaseRole] = useState('manager');
  const [perms, setPerms] = useState(ROLE_PRESETS.manager.permissions);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      // listUsers runs with the service role so users added directly in Base44
      // (not just the logged-in user) show up. Fall back to the RLS-scoped list.
      try {
        const res = await base44.functions.invoke('listUsers', {});
        return res?.data?.users || [];
      } catch {
        return base44.entities.User.list();
      }
    },
  });

  const applyPreset = (r) => { setBaseRole(r); setPerms({ ...ROLE_PRESETS[r].permissions }); };
  const toggle = (key) => setPerms(p => { const n = { ...p }; if (n[key]) delete n[key]; else n[key] = true; return n; });

  const openInvite = () => { setEmail(''); applyPreset('manager'); setInviteOpen(true); };
  const openEdit = (u) => {
    setEditing(u);
    setBaseRole(u.base_role || 'manager');
    setPerms(parsePerms(u.permissions));
  };

  const handleInvite = async () => {
    setInviting(true);
    const finalPerms = sanitizePermissions(baseRole, perms);
    await base44.users.inviteUser(email, baseRole === 'owner' || baseRole === 'admin' ? 'admin' : 'user');
    // Record a pending Invitation row so the invited person shows in the table
    // as "Pending" before they accept and log in. Once they log in they get a
    // real User record and the row flips to "Active" automatically.
    await base44.functions.invoke('recordInvitation', {
      email,
      base_role: baseRole,
      permissions: JSON.stringify(finalPerms),
      role: (baseRole === 'owner' || baseRole === 'admin') ? 'admin' : 'user',
    });
    toast.success(`Invitation sent to ${email}`);
    setInviteOpen(false); setEmail(''); setInviting(false);
    qc.invalidateQueries({ queryKey: ['users'] });
  };

  const saveEdit = async () => {
    const finalPerms = sanitizePermissions(baseRole, perms);
    await base44.entities.User.update(editing.id, {
      base_role: baseRole,
      permissions: JSON.stringify(finalPerms),
      role: baseRole === 'owner' || baseRole === 'admin' ? 'admin' : 'user',
    });
    toast.success('Access updated');
    setEditing(null);
    qc.invalidateQueries({ queryKey: ['users'] });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.status === 'pending') {
      await base44.functions.invoke('cancelInvitation', { invitation_id: deleteTarget.invitation_id });
      toast.success('Invitation cancelled');
    } else {
      await base44.entities.User.delete(deleteTarget.id);
      toast.success('User removed');
    }
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ['users'] });
  };

  const isPartner = baseRole === 'supplier' || baseRole === 'buyer';
  const restricted = (key) => isPartner && ['finances', 'bank_feed'].includes(key);
  const restrictedGroup = (group) => isPartner && group === 'Lead Distribution';

  // Select/deselect all helpers. Blocked keys (partner-locked Finances, Bank Feed,
  // Lead Distribution) are excluded so Select all never grants a locked section.
  const groupSelectableKeys = (g) => g.items.filter(item => !(restricted(item.key) || restrictedGroup(g.group))).map(item => item.key);
  const allSelectableKeys = () => PERMISSION_GROUPS.flatMap(groupSelectableKeys);
  const setKeys = (keys, value) => setPerms(p => {
    const n = { ...p };
    keys.forEach(k => { if (value) n[k] = true; else delete n[k]; });
    return n;
  });

  const Checklist = () => {
    const allKeys = allSelectableKeys();
    const allOn = allKeys.length > 0 && allKeys.every(k => !!perms[k]);
    return (
      <div className="space-y-4 max-h-[46vh] overflow-y-auto pr-1">
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">All sections</span>
          <button type="button" onClick={() => setKeys(allKeys, !allOn)} className="text-[11px] font-medium text-primary hover:opacity-80">
            {allOn ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        {PERMISSION_GROUPS.map(g => {
          const groupKeys = groupSelectableKeys(g);
          const groupOn = groupKeys.length > 0 && groupKeys.every(k => !!perms[k]);
          const groupBlocked = restrictedGroup(g.group) || groupKeys.length === 0;
          return (
            <div key={g.group}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{g.group}</div>
                {!groupBlocked && (
                  <button type="button" onClick={() => setKeys(groupKeys, !groupOn)} className="text-[10px] font-medium text-primary hover:opacity-80">
                    {groupOn ? 'Clear' : 'All'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {g.items.map(item => {
                  const blocked = restricted(item.key) || restrictedGroup(g.group);
                  return (
                    <label key={item.key} className={`flex items-center gap-2 text-[13px] ${blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                      <Checkbox checked={!blocked && !!perms[item.key]} disabled={blocked} onCheckedChange={() => !blocked && toggle(item.key)} />
                      <span className="text-foreground">{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        {isPartner && <div className="text-[11px] text-muted-foreground">Supplier & Buyer roles can never access Lead Distribution or Finances, so those are locked off.</div>}
      </div>
    );
  };

  const RolePicker = () => (
    <div>
      <Label className="text-[12px]">Base role preset</Label>
      <Select value={baseRole} onValueChange={applyPreset}>
        <SelectTrigger className="mt-1 bg-background text-[13px]"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(ROLE_PRESETS).map(([k, r]) => <SelectItem key={k} value={k}>{r.label}</SelectItem>)}</SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground mt-1">{ROLE_PRESETS[baseRole].description} Every box stays individually editable below.</p>
    </div>
  );

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={openInvite} className="gap-1.5"><UserPlus className="w-4 h-4" /> Invite User</Button>
      </div>

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {['Name', 'Email', 'Role', 'Status', 'Access', 'Joined', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No users found</td></tr>}
            {users.map((u, idx) => {
              const p = parsePerms(u.permissions);
              const count = Object.keys(p).length;
              const preset = ROLE_PRESETS[u.base_role];
              const isPending = u.status === 'pending';
              return (
                <motion.tr key={u.id} variants={riseIn} initial="hidden" animate="show" custom={idx} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{u.full_name || (isPending ? <span className="text-muted-foreground italic">Invite pending</span> : '-')}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3"><Tag tone="muted">{preset?.label || u.role || 'user'}</Tag></td>
                  <td className="px-4 py-3">
                    {isPending
                      ? <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-status-unsold"><span className="w-1.5 h-1.5 rounded-full bg-status-unsold-dot" style={{ backgroundColor: '#FACC14' }} />Pending</span>
                      : <span className="inline-flex items-center gap-1.5 text-[11px] font-medium status-sold"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#3DD68C' }} />Active</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-[11px]">{count > 0 ? `${count} section${count !== 1 ? 's' : ''}` : '0 sections'}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{isPending ? <span className="italic">Invited {u.created_date ? format(new Date(u.created_date), 'MMM dd') : ''}</span> : (u.created_date ? format(new Date(u.created_date), 'MMM dd, yyyy') : '-')}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {!isPending && <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => openEdit(u)}>Edit access</Button>}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(u)} title={isPending ? 'Cancel invite' : 'Remove user'}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </Panel>

      {/* Invite */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-popover border-border max-w-[560px]">
          <DialogHeader><DialogTitle>Invite User</DialogTitle><DialogDescription>Pick a base role, then tick exactly what this user can see.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-[12px]">Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" className="mt-1 bg-background" /></div>
            {RolePicker()}
            <div className="border-t border-border pt-3">{Checklist()}</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={!email || inviting}>{inviting ? 'Sending...' : 'Send Invite'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit access */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-popover border-border max-w-[560px]">
          <DialogHeader><DialogTitle>Edit access · {editing?.full_name || editing?.email}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {RolePicker()}
            <div className="border-t border-border pt-3">{Checklist()}</div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save access</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-popover border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.status === 'pending' ? 'Cancel invitation?' : 'Remove user?'}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.status === 'pending' ? `This cancels the pending invitation for "${deleteTarget?.email}".` : `This removes "${deleteTarget?.full_name || deleteTarget?.email}" from the app. This cannot be undone.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}