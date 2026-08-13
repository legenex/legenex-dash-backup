import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePortalScope } from './usePortalScope';

// Runs a scoped portal write action (request_return / add_feedback) and refreshes data.
export function usePortalAction() {
  const qc = useQueryClient();
  const { previewBuyerId } = usePortalScope();

  const run = async (payload) => {
    const body = previewBuyerId ? { ...payload, buyer_id: previewBuyerId } : payload;
    const res = await base44.functions.invoke('portalAction', body);
    await qc.invalidateQueries({ queryKey: ['portal-data'] });
    return res.data;
  };

  return { run };
}