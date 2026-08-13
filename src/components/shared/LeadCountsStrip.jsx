import React from 'react';

// One thin strip of lead counts, shared by the Leads section and the Reports
// canvas so the two can never report different numbers for the same window.
//
// Order is fixed and deliberate: it follows the pipeline from intake to
// outcome, so the eye reads left to right the way a lead actually moves.
//
// Counts are derived from a set of leads that has ALREADY had every filter
// applied. That is the point: the strip previously sat in the Leads footer and
// counted the whole period regardless of the status, supplier, buyer or source
// filters on screen, so selecting a supplier changed the table and left the
// numbers untouched.

const S = (l) => String(l?.final_status || '');
const mf = (l) => {
  try { return JSON.parse(l?.mapped_fields || '{}'); } catch { return {}; }
};
const truthy = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
};

// Returns the full count set for a list of leads.
export function leadCounts(leads = []) {
  let sold = 0, unsold = 0, disqualified = 0, returned = 0;
  let rejected = 0, duplicate = 0, fake = 0, converted = 0;

  for (const l of leads) {
    const s = S(l);
    if (s === 'Sold') sold += 1;
    else if (s === 'Unsold') unsold += 1;
    else if (s === 'Disqualified') disqualified += 1;
    else if (s === 'Returned') returned += 1;
    else if (s === 'Rejected') rejected += 1;
    else if (s === 'Duplicate') duplicate += 1;

    const bag = mf(l);
    // Returned is a status in this system, but a lead can also carry the flag
    // while sitting in another status, so count both without double counting.
    if (s !== 'Returned' && (l.buyer_returned === true || truthy(bag.returned))) returned += 1;
    if (truthy(bag.fake) || truthy(bag.is_fake) || String(bag.buyer_feedback || '').toLowerCase().includes('faux')) fake += 1;
    if (l.converted === true || truthy(bag.converted) || truthy(bag.conversion)) converted += 1;
  }

  const total = leads.length;

  // No conversion rate here. Sold over total was being labelled "conversion",
  // but a conversion is a buyer-side outcome this system is never told about,
  // so the figure was a different metric wearing the wrong name.
  return { total, sold, unsold, disqualified, returned, rejected, duplicate, fake, converted };
}

const ITEMS = [
  { key: 'total', label: 'Total', tone: 'text-foreground' },
  { key: 'sold', label: 'Sold', tone: 'status-sold' },
  { key: 'unsold', label: 'Unsold', tone: 'status-unsold' },
  { key: 'disqualified', label: 'Disqualified', tone: 'status-disqualified' },
  { key: 'returned', label: 'Returned', tone: 'status-returned' },
  { key: 'rejected', label: 'Rejected', tone: 'status-rejected' },
  { key: 'duplicate', label: 'Duplicate', tone: 'status-duplicate' },
  { key: 'fake', label: 'Fake', tone: 'status-error' },
  { key: 'converted', label: 'Converted', tone: 'status-converted' },
];

export default function LeadCountsStrip({ leads, counts, right = null, className = '' }) {
  const c = counts || leadCounts(leads || []);

  return (
    <div className={`flex items-center gap-x-4 gap-y-1.5 flex-wrap rounded-lg border border-border bg-card px-3 py-2 ${className}`}>
      {ITEMS.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1.5 shrink-0">
          <span className="text-[9.5px] font-semibold tracking-[0.11em] uppercase text-muted-foreground/70">{i.label}</span>
          <span className={`text-[11.5px] font-mono font-semibold tabular-nums ${i.tone}`}>
            {c[i.key].toLocaleString()}
          </span>
        </span>
      ))}
      {right && <span className="ml-auto shrink-0">{right}</span>}
    </div>
  );
}
