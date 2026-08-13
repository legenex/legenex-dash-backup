import { base44 } from '@/api/base44Client';

// Operator-facing Lead reads. Lead has admin-only RLS, so client-side Lead reads
// return empty for platform role "user" (base_role manager). These helpers route
// through the operatorData backend function, which reads via the service role
// after gating the caller as an operator. Both mirror the SDK read signatures so
// they can drop in wherever Lead.list / Lead.filter are used.

async function invokeOperatorData(payload) {
  const res = await base44.functions.invoke('operatorData', payload);
  const rows = res?.data?.rows;
  return Array.isArray(rows) ? rows : [];
}

export async function listLeads(sort = '-created_date', limit = 2000, skip = 0) {
  return invokeOperatorData({ entity: 'Lead', query: null, sort, limit, skip });
}

export async function filterLeads(query, sort = '-created_date', limit = 2000, skip = 0) {
  return invokeOperatorData({ entity: 'Lead', query, sort, limit, skip });
}