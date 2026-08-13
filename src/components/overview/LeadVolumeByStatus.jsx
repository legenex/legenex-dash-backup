import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// Stacked bar chart of leads per day by final_status over the period. Styling
// matches the existing ComposedChart on the Overview page (tick colors, tooltip
// contentStyle, fonts). Reads the passed period-filtered leads only.
const STATUS_COLORS = {
  Processing: '#3182BD',
  Sold: '#3DD68C',
  Unsold: '#FACC14',
  Disqualified: '#F97316',
  Queued: '#7564CC',
  Returned: '#FFB082',
  Duplicate: '#3182BD',
  Error: '#E5484D',
};
const STATUS_ORDER = ['Sold', 'Unsold', 'Disqualified', 'Queued', 'Returned', 'Duplicate', 'Error', 'Processing'];

export default function LeadVolumeByStatus({ leads = [] }) {
  const data = useMemo(() => {
    const byDay = {};
    for (const l of leads) {
      if (!l.created_date) continue;
      const day = String(l.created_date).slice(0, 10);
      if (!byDay[day]) byDay[day] = { date: day };
      const s = l.final_status || 'Processing';
      byDay[day][s] = (byDay[day][s] || 0) + 1;
    }
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
  }, [leads]);

  const presentStatuses = useMemo(() => {
    const set = new Set();
    for (const row of data) {
      for (const k of Object.keys(row)) if (k !== 'date') set.add(k);
    }
    return STATUS_ORDER.filter(s => set.has(s));
  }, [data]);

  if (data.length === 0) {
    return <div className="h-[260px] flex items-center justify-center text-[13px] text-muted-foreground">No leads in this period</div>;
  }

  return (
    <div className="p-5">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <XAxis dataKey="date" tick={{ fill: '#8B95A8', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={{ fill: '#8B95A8', fontSize: 11 }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
          <Tooltip contentStyle={{ backgroundColor: '#182030', border: '1px solid #243044', borderRadius: '8px', fontSize: 12 }} labelStyle={{ color: '#EEF2F8' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {presentStatuses.map(s => (
            <Bar key={s} dataKey={s} stackId="a" fill={STATUS_COLORS[s] || '#8B95A8'} maxBarSize={22} animationDuration={800} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}