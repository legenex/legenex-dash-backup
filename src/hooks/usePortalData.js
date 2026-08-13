import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePortalScope } from './usePortalScope';

// Fetches buyer-scoped portal data (leads, feedback, returns) via the backend
// function, which enforces scoping server-side.
export function usePortalData() {
  const { previewBuyerId, rolePreview } = usePortalScope();

  const query = useQuery({
    queryKey: ['portal-data', previewBuyerId || (rolePreview ? 'role-preview' : 'self')],
    queryFn: async () => {
      const payload = previewBuyerId
        ? { buyer_id: previewBuyerId }
        : (rolePreview ? { preview_role: true } : {});
      const res = await base44.functions.invoke('portalData', payload);
      return res.data;
    },
    retry: false,
  });

  return query;
}