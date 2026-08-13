import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import CountUpText from '@/components/overview/CountUpText';
import { money, int } from '@/lib/reportMetrics';

// Suppliers for the period: lead count, sold count, sold rate and revenue.
// Sorted by revenue descending, capped at the top 10. Reads supplier_name and
// revenue off the passed period-filtered Lead records only.
const gridVariants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export default function SupplierLeaderboard({ leads = [] }) {
  const rows = useMemo(() => {
    const acc = {};
    for (const l of leads) {
      const name = l.supplier_name || 'Unknown';
      if (!acc[name]) acc[name] = { name, leads: 0, sold: 0, revenue: 0 };
      acc[name].leads++;
      if (l.final_status === 'Sold') acc[name].sold++;
      acc[name].revenue += Number(l.revenue) || 0;
    }
    return Object.values(acc)
      .map(r => ({ ...r, soldRate: r.leads > 0 ? Math.round((r.sold / r.leads) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [leads]);

  if (rows.length === 0) {
    return <div className="h-[220px] flex items-center justify-center text-[13px] text-muted-foreground">No supplier activity in this period</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead><tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider bg-muted/40">
          <th className="text-left px-4 py-2.5">Supplier</th>
          <th className="text-right px-4 py-2.5">Leads</th>
          <th className="text-right px-4 py-2.5">Sold</th>
          <th className="text-right px-4 py-2.5">Sold Rate</th>
          <th className="text-right px-4 py-2.5">Revenue</th>
        </tr></thead>
        <motion.tbody variants={gridVariants} initial="hidden" animate="show" className="divide-y divide-border">
          {rows.map(r => (
            <motion.tr key={r.name} variants={itemVariants} className="hover:bg-accent/30">
              <td className="px-4 py-2.5 text-foreground truncate max-w-[200px]">{r.name}</td>
              <td className="px-4 py-2.5 text-right font-mono">{int(r.leads)}</td>
              <td className="px-4 py-2.5 text-right font-mono status-sold">{int(r.sold)}</td>
              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{r.soldRate}%</td>
              <td className="px-4 py-2.5 text-right font-mono"><CountUpText value={r.revenue} render={(n) => money(n)} /></td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}