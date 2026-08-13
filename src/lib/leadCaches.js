// Canonical list of every React Query key that reads lead data. A lead
// mutation anywhere in the app must invalidate all of these so every lead view
// (the Leads table, Reports, Finances, rejections, campaign metrics, the legacy
// Leads page) refetches instead of serving stale cache.
//
// IMPORTANT: any new lead-related query key added elsewhere in the app MUST be
// added to this list, or that view will show stale data after a mutation.
//
// Verified usages:
// - 'leads-all-non-archived' in LeadsTable.jsx (the main Leads screen) AND
//   LeadsNav.jsx. They share one key on purpose: two caches of the same query
//   drifted apart, so the sub-nav badges and the table reported different Sold
//   counts on the same screen. Do not give either its own key again.
// - 'leads' in src/pages/Leads.jsx
// - 'report-leads' in Reports.jsx, Finances.jsx, useAdManagerData.js, AdSpendTab.jsx
// - 'leads-rejections' in LeadsRejections.jsx
// - 'leads-metrics' in CampaignSuppliers.jsx, CampaignsList.jsx, CampaignDetailPage.jsx
export const LEAD_QUERY_KEYS = [
  'leads-all-non-archived',
  'leads',
  'report-leads',
  'leads-rejections',
  'leads-metrics',
];

// Invalidate every lead-related query key so all lead views refresh.
export function invalidateLeadCaches(qc) {
  LEAD_QUERY_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
}