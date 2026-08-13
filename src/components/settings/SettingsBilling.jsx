import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CreditCard, Check } from 'lucide-react';
import { Panel, StatChip, Tag } from '@/components/settings/settingsUi';

const PLANS = [
  { name: 'Starter', price: '$0', features: ['Up to 5k leads / mo', '1 team member', 'CSV import'], current: true },
  { name: 'Growth', price: '$149', features: ['Up to 100k leads / mo', '10 team members', 'Ad spend sync', 'DataBot'] },
  { name: 'Scale', price: 'Custom', features: ['Unlimited leads', 'Unlimited members', 'Priority support', 'SLA'] },
];

function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export default function SettingsBilling() {
  const monthStart = startOfMonthISO();

  const { data: leads = [] } = useQuery({
    queryKey: ['billing-leads-month'],
    queryFn: () => base44.entities.Lead.filter({ created_date: { $gte: monthStart } }, '-created_date', 5000),
  });
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => base44.entities.User.list() });
  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => base44.entities.Invoice.list('-created_date', 500),
  });

  const leadsThisMonth = leads.length;
  const outstanding = invoices
    .filter(i => i.status !== 'paid')
    .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Billing summary, real values, honest zeros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatChip label="Leads This Month" value={leadsThisMonth.toLocaleString()} tone="good" i={0} sub="Current billing period" />
        <StatChip label="Team Members" value={users.length} i={1} sub="Active seats" />
        <StatChip label="Outstanding" value={`$${outstanding.toFixed(2)}`} tone={outstanding > 0 ? 'warn' : undefined} i={2} sub="Unpaid invoices" />
      </div>

      {/* Payment method */}
      <Panel className="p-4 flex items-center justify-between" i={0}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-primary" /></div>
          <div>
            <div className="text-[14px] font-semibold text-foreground">Payment method</div>
            <div className="text-[12px] text-muted-foreground">No card on file yet.</div>
          </div>
        </div>
        <Button size="sm" variant="outline">Add card</Button>
      </Panel>

      {/* Plans */}
      <div>
        <div className="text-[15px] font-semibold text-foreground mb-3">Plans</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((p, idx) => (
            <Panel key={p.name} className={`p-5 ${p.current ? 'border-primary' : ''}`} i={idx + 1} hover>
              <div className="flex items-center justify-between">
                <div className="text-[15px] font-semibold text-foreground">{p.name}</div>
                {p.current && <Tag tone="primary">Current</Tag>}
              </div>
              <div className="text-[26px] font-bold text-foreground mt-2 font-mono">{p.price}<span className="text-[12px] text-muted-foreground font-sans font-normal">{p.price !== 'Custom' ? '/mo' : ''}</span></div>
              <ul className="mt-4 space-y-2">
                {p.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-[12px] text-muted-foreground"><Check className="w-3.5 h-3.5 status-sold" /> {f}</li>
                ))}
              </ul>
              <Button size="sm" variant={p.current ? 'outline' : 'default'} className="w-full mt-5" disabled={p.current}>
                {p.current ? 'Current plan' : 'Upgrade'}
              </Button>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}