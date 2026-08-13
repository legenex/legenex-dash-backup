import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Save, Tags, GitBranch, Users, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { Panel } from '@/components/finances/financeAtoms';
import { loadFinanceSettings, saveFinanceSettings, emptySettings, newId, COST_CLASSES } from '@/lib/financeSettings';

const SUB_TABS = [
  { key: 'categories', label: 'Categories', icon: Tags },
  { key: 'rules', label: 'Matching Rules', icon: GitBranch },
  { key: 'counterparties', label: 'Counterparties', icon: Users },
  { key: 'accounts', label: 'Accounts', icon: Landmark },
];

const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'category';

// Comma-separated array editor used for keywords and aliases.
function TagsInput({ value = [], onChange, placeholder }) {
  return (
    <Input
      value={value.join(', ')}
      onChange={e => onChange(e.target.value.split(',').map(v => v.trim()).filter(Boolean))}
      placeholder={placeholder}
      className="bg-background text-[12px]"
    />
  );
}

export default function FinanceSettingsTab() {
  const [cfgId, setCfgId] = useState(null);
  const [settings, setSettings] = useState(emptySettings());
  const [tab, setTab] = useState('categories');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const { data: buyers = [] } = useQuery({ queryKey: ['buyers'], queryFn: () => base44.entities.Buyer.list() });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });

  useEffect(() => {
    (async () => {
      try {
        const { id, settings: s } = await loadFinanceSettings();
        setCfgId(id);
        setSettings(s);
      } catch { toast.error('Could not load finance settings'); }
      setLoading(false);
    })();
  }, []);

  const patch = (key, next) => { setSettings(s => ({ ...s, [key]: next })); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const res = await saveFinanceSettings(cfgId, settings);
      if (res?.id && !cfgId) setCfgId(res.id);
      setDirty(false);
      toast.success('Finance settings saved');
    } catch { toast.error('Save failed'); }
    setSaving(false);
  };

  const nameOptions = useMemo(() => ({
    buyer: buyers.map(b => b.company_name).filter(Boolean),
    supplier: suppliers.map(s => s.name).filter(Boolean),
  }), [buyers, suppliers]);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-muted-foreground max-w-2xl">
          The mapping layer for Finances. Define categories, tie bank descriptions to buyers and suppliers, and give each counterparty the aliases it appears as on the statement. Resolve and AI categorization read this as ground truth.
        </p>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={save} disabled={saving || !dirty}>
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
        </Button>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1.5">
        {SUB_TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors ${tab === t.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* CATEGORIES */}
      {tab === 'categories' && (
        <Panel className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold text-foreground">Transaction Categories</div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => patch('categories', [...settings.categories, { id: newId('cat'), key: newId('cat'), label: 'New Category', group: 'Other', cost_class: 'fixed', keywords: [] }])}>
              <Plus className="w-3.5 h-3.5" /> Add Category
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1fr_2fr_auto] gap-2 px-2.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-muted-foreground/70">
            <div>Label</div>
            <div>Group</div>
            <div>Cost Class</div>
            <div>Keywords</div>
            <div />
          </div>
          <div className="space-y-2">
            {settings.categories.map((c, i) => (
              <div key={c.id} className="grid grid-cols-[1fr_1fr_1fr_2fr_auto] gap-2 items-center rounded-lg border border-border bg-background/40 p-2.5">
                <Input
                  value={c.label}
                  onChange={e => { const v = e.target.value; patch('categories', settings.categories.map((x, j) => j === i ? { ...x, label: v, key: x.key?.startsWith('cat_') ? slug(v) : x.key } : x)); }}
                  className="bg-background text-[12px] font-medium"
                />
                <Input
                  value={c.group || ''}
                  onChange={e => { const v = e.target.value; patch('categories', settings.categories.map((x, j) => j === i ? { ...x, group: v } : x)); }}
                  placeholder="Group"
                  className="bg-background text-[12px]"
                />
                <Select value={c.cost_class} onValueChange={v => patch('categories', settings.categories.map((x, j) => j === i ? { ...x, cost_class: v } : x))}>
                  <SelectTrigger className="bg-background text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{COST_CLASSES.map(cc => <SelectItem key={cc.key} value={cc.key}>{cc.label}</SelectItem>)}</SelectContent>
                </Select>
                <TagsInput value={c.keywords} onChange={kw => patch('categories', settings.categories.map((x, j) => j === i ? { ...x, keywords: kw } : x))} placeholder="Keywords that match this category, comma separated" />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => patch('categories', settings.categories.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/70">Keywords are matched against the transaction description to auto-suggest a category in the Bank Feed and the expense drawer.</p>
          <p className="text-[11px] text-muted-foreground/70">Cost Class drives the Profitability tab: variable costs scale with leads, fixed costs set the breakeven bar, drawings sit below the line, and excluded keeps internal transfers from double counting.</p>
        </Panel>
      )}

      {/* MATCHING RULES */}
      {tab === 'rules' && (
        <Panel className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold text-foreground">Matching Rules</div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => patch('matchRules', [...settings.matchRules, { id: newId('rule'), pattern: '', entity_type: 'buyer', entity_name: '' }])}>
              <Plus className="w-3.5 h-3.5" /> Add Rule
            </Button>
          </div>
          <div className="space-y-2">
            {settings.matchRules.length === 0 && <div className="text-[12px] text-muted-foreground py-4 text-center">No rules yet. Add one to auto-match deposits, for example "WA2" to Walker Advertising.</div>}
            {settings.matchRules.map((r, i) => (
              <div key={r.id} className="grid grid-cols-[2fr_1fr_2fr_auto] gap-2 items-center rounded-lg border border-border bg-background/40 p-2.5">
                <Input value={r.pattern} onChange={e => { const v = e.target.value; patch('matchRules', settings.matchRules.map((x, j) => j === i ? { ...x, pattern: v } : x)); }} placeholder="Description contains..." className="bg-background text-[12px]" />
                <Select value={r.entity_type} onValueChange={v => patch('matchRules', settings.matchRules.map((x, j) => j === i ? { ...x, entity_type: v, entity_name: '' } : x))}>
                  <SelectTrigger className="bg-background text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="buyer">Buyer</SelectItem><SelectItem value="supplier">Supplier</SelectItem></SelectContent>
                </Select>
                <Select value={r.entity_name} onValueChange={v => patch('matchRules', settings.matchRules.map((x, j) => j === i ? { ...x, entity_name: v } : x))}>
                  <SelectTrigger className="bg-background text-[12px]"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{(nameOptions[r.entity_type] || []).map(nm => <SelectItem key={nm} value={nm}>{nm}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => patch('matchRules', settings.matchRules.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* COUNTERPARTIES */}
      {tab === 'counterparties' && (
        <Panel className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold text-foreground">Counterparty Aliases</div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => patch('counterparties', [...settings.counterparties, { id: newId('cp'), type: 'buyer', name: '', aliases: [] }])}>
              <Plus className="w-3.5 h-3.5" /> Add Counterparty
            </Button>
          </div>
          <div className="space-y-2">
            {settings.counterparties.length === 0 && <div className="text-[12px] text-muted-foreground py-4 text-center">Add the names your buyers and suppliers show up as in bank text so deposits match reliably.</div>}
            {settings.counterparties.map((c, i) => (
              <div key={c.id} className="grid grid-cols-[1fr_2fr_2fr_auto] gap-2 items-center rounded-lg border border-border bg-background/40 p-2.5">
                <Select value={c.type} onValueChange={v => patch('counterparties', settings.counterparties.map((x, j) => j === i ? { ...x, type: v, name: '' } : x))}>
                  <SelectTrigger className="bg-background text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="buyer">Buyer</SelectItem><SelectItem value="supplier">Supplier</SelectItem></SelectContent>
                </Select>
                <Select value={c.name} onValueChange={v => patch('counterparties', settings.counterparties.map((x, j) => j === i ? { ...x, name: v } : x))}>
                  <SelectTrigger className="bg-background text-[12px]"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{(nameOptions[c.type] || []).map(nm => <SelectItem key={nm} value={nm}>{nm}</SelectItem>)}</SelectContent>
                </Select>
                <TagsInput value={c.aliases} onChange={al => patch('counterparties', settings.counterparties.map((x, j) => j === i ? { ...x, aliases: al } : x))} placeholder="WA2, WALKER, ... comma separated" />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => patch('counterparties', settings.counterparties.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ACCOUNTS */}
      {tab === 'accounts' && (
        <Panel className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold text-foreground">Accounts</div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => patch('accounts', [...settings.accounts, { id: newId('acct'), name: '', kind: 'expense' }])}>
              <Plus className="w-3.5 h-3.5" /> Add Account
            </Button>
          </div>
          <div className="space-y-2">
            {settings.accounts.length === 0 && <div className="text-[12px] text-muted-foreground py-4 text-center">Add bank and expense accounts so a transaction can be assigned to a bucket.</div>}
            {settings.accounts.map((a, i) => (
              <div key={a.id} className="grid grid-cols-[2fr_1fr_auto] gap-2 items-center rounded-lg border border-border bg-background/40 p-2.5">
                <Input value={a.name} onChange={e => { const v = e.target.value; patch('accounts', settings.accounts.map((x, j) => j === i ? { ...x, name: v } : x)); }} placeholder="Account name" className="bg-background text-[12px]" />
                <Select value={a.kind} onValueChange={v => patch('accounts', settings.accounts.map((x, j) => j === i ? { ...x, kind: v } : x))}>
                  <SelectTrigger className="bg-background text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="bank">Bank</SelectItem><SelectItem value="expense">Expense</SelectItem></SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => patch('accounts', settings.accounts.filter((_, j) => j !== i))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Cross-links to the existing managers so this page stays the mapping layer, not a duplicate CRUD. */}
      <Panel className="p-4">
        <div className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/70 mb-2">Manage records elsewhere</div>
        <div className="flex flex-wrap gap-2 text-[12px]">
          <a href="/campaigns?tab=buyers" className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Buyers</a>
          <a href="/campaigns?tab=suppliers" className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Suppliers</a>
          <a href="/settings?tab=users" className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Users and Roles</a>
          <a href="/tools" className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Tools</a>
          <a href="/settings?tab=integrations" className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Integrations</a>
        </div>
      </Panel>
    </div>
  );
}