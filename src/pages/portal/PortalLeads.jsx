import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StatusPill from '@/components/shared/StatusPill';
import { Undo2, MessageSquarePlus } from 'lucide-react';
import { format } from 'date-fns';
import { money } from '@/lib/reportMetrics';
import FeedbackDialog from '@/components/portal/FeedbackDialog';
import ReturnDialog from '@/components/portal/ReturnDialog';

export default function PortalLeads() {
  const { data } = useOutletContext();
  const leads = data?.leads || [];
  const [q, setQ] = useState('');
  const [feedbackLead, setFeedbackLead] = useState(null);
  const [returnLead, setReturnLead] = useState(null);

  const filtered = leads.filter(l => {
    if (!q) return true;
    const s = q.toLowerCase();
    return `${l.first_name || ''} ${l.last_name || ''}`.toLowerCase().includes(s)
      || String(l.mobile || '').includes(s)
      || String(l.email || '').toLowerCase().includes(s);
  });

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight">My Leads</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Leads delivered to you. Request a return or add feedback.</p>
        </div>
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, email…" className="w-64 bg-background text-[13px]" />
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-x-auto">
        <table className="w-full text-[13px] min-w-[820px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {['Lead', 'Contact', 'Status', 'Revenue', 'Feedback', 'Received', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No leads yet.</td></tr>
            )}
            {filtered.map(l => (
              <tr key={l.id} className="hover:bg-accent/40 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{l.first_name} {l.last_name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  <div>{l.mobile || '-'}</div>
                  <div className="text-[11px]">{l.email || ''}</div>
                </td>
                <td className="px-4 py-3"><StatusPill status={l.final_status} /></td>
                <td className="px-4 py-3 font-mono text-[12px]">{money(l.revenue)}</td>
                <td className="px-4 py-3">
                  {l.buyer_feedback ? <span className="text-[12px] text-foreground">{l.buyer_feedback}</span> : <span className="text-[12px] text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{l.created_date ? format(new Date(l.created_date), 'MMM dd, yyyy') : '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1" onClick={() => setFeedbackLead(l)}>
                      <MessageSquarePlus className="w-3.5 h-3.5" /> Feedback
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1 text-primary" onClick={() => setReturnLead(l)}>
                      <Undo2 className="w-3.5 h-3.5" /> Return
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {feedbackLead && <FeedbackDialog lead={feedbackLead} open={!!feedbackLead} onClose={() => setFeedbackLead(null)} />}
      {returnLead && <ReturnDialog lead={returnLead} open={!!returnLead} onClose={() => setReturnLead(null)} />}
    </div>
  );
}