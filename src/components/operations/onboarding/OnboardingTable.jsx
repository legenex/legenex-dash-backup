import React, { useMemo } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import OnboardingStatusPill from './OnboardingStatusPill';
import { STEP_LABELS, parseSteps, stepsFraction, stepsCompleteCount } from './onboardingModel';

function fmtDate(value) {
  if (!value) return '--';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Sort value per column key. Numbers and dates sort naturally, strings lowercased.
function sortValue(record, key) {
  const steps = parseSteps(record);
  switch (key) {
    case 'company': return String(record.company_name || '').toLowerCase();
    case 'buyer_code': return String(record.buyer_code || '').toLowerCase();
    case 'status': return String(record.status || '').toLowerCase();
    case 'current_step': return String(record.current_step || '').toLowerCase();
    case 'progress': return stepsCompleteCount(steps);
    case 'submitted_at': return record.submitted_at ? new Date(record.submitted_at).getTime() : 0;
    case 'intro': return record.intro_email_scheduled_for ? new Date(record.intro_email_scheduled_for).getTime() : 0;
    default: return '';
  }
}

const COLUMNS = [
  { key: 'company', label: 'Company', align: 'left' },
  { key: 'buyer_code', label: 'Linked buyer code', align: 'left' },
  { key: 'status', label: 'Status', align: 'left' },
  { key: 'current_step', label: 'Current step', align: 'left' },
  { key: 'progress', label: 'Steps complete', align: 'left' },
  { key: 'submitted_at', label: 'Submitted at', align: 'left' },
  { key: 'intro', label: 'Intro email scheduled', align: 'left' },
];

export default function OnboardingTable({ records, buyerCodeById, sortKey, sortDir, onSort, onRowClick }) {
  const rows = useMemo(() => {
    const sorted = [...records].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [records, sortKey, sortDir]);

  return (
    <div className="bg-card border border-border rounded-[12px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border">
              {COLUMNS.map((col) => (
                <th key={col.key} className="text-left font-medium text-muted-foreground px-4 py-2.5 whitespace-nowrap">
                  <button
                    onClick={() => onSort(col.key)}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    {col.label}
                    {sortKey === col.key && (
                      sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => {
              const steps = parseSteps(record);
              const code = record.buyer_code || (record.buyer_id ? buyerCodeById[record.buyer_id] : '') || '';
              return (
                <tr
                  key={record.id}
                  onClick={() => onRowClick(record)}
                  className="border-b border-border last:border-0 hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{record.company_name || 'Unnamed'}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground whitespace-nowrap">{code || '--'}</td>
                  <td className="px-4 py-3"><OnboardingStatusPill status={record.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {record.current_step ? (STEP_LABELS[record.current_step] || record.current_step) : '--'}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground whitespace-nowrap tabular-nums">{stepsFraction(steps)}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(record.submitted_at || record.created_date)}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(record.intro_email_scheduled_for)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}