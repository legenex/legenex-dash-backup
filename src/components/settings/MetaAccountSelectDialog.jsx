import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search } from 'lucide-react';

// Account selection step used both when adding a new token and when managing an
// existing token's accounts. `state` shape:
//   { mode: 'add'|'edit', label, token, tokenId, accounts:[{id,name,account_id,currency}], chosen:string[], saving }
// onConfirm(chosenIds), onCancel().
export default function MetaAccountSelectDialog({ state, onChange, onConfirm, onCancel }) {
  const [search, setSearch] = useState('');
  const open = !!state;
  const accounts = state?.accounts || [];
  const chosen = state?.chosen || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a => `${a.name || ''} ${a.account_id || ''}`.toLowerCase().includes(q));
  }, [accounts, search]);

  const toggle = (id) => {
    const next = chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id];
    onChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSearch(''); onCancel(); } }}>
      <DialogContent className="bg-popover border-border max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{state?.mode === 'edit' ? `Manage accounts for ${state?.label}` : `Select accounts for ${state?.label}`}</DialogTitle>
        </DialogHeader>

        <div className="text-[12px] text-muted-foreground">{chosen.length} of {accounts.length} selected</div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or account id" className="pl-8 bg-background text-[13px]" />
          </div>
          <Button size="sm" variant="outline" onClick={() => onChange(accounts.map(a => a.id))}>Select all</Button>
          <Button size="sm" variant="outline" onClick={() => onChange([])}>Clear all</Button>
        </div>

        <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
          {accounts.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-3">This token cannot reach any ad accounts.</p>
          ) : filtered.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-3">No accounts match "{search}".</p>
          ) : filtered.map(a => (
            <label key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background gap-3 cursor-pointer">
              <div className="flex items-center gap-3 min-w-0">
                <Checkbox checked={chosen.includes(a.id)} onCheckedChange={() => toggle(a.id)} />
                <div className="min-w-0">
                  <div className="text-[13px] text-foreground font-medium truncate">{a.name || a.account_id}</div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-[11px] text-muted-foreground font-mono">{a.account_id}</span>
                    {a.currency && <Badge variant="outline" className="text-[10px]">{a.currency}</Badge>}
                  </div>
                </div>
              </div>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setSearch(''); onCancel(); }}>Cancel</Button>
          <Button onClick={() => { setSearch(''); onConfirm(chosen); }} disabled={state?.saving}>
            {state?.saving ? 'Saving…' : (state?.mode === 'edit' ? 'Save accounts' : 'Confirm and add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}