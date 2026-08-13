import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useSupplierPortalScope } from './useSupplierPortalScope';

// Fetches supplier-scoped portal data (leads, returns, api key, ad reporting)
// via the backend function, which enforces scoping server-side.
export function useSupplierPortalData() {
  const { previewSupplierId, rolePreview } = useSupplierPortalScope();

  const query = useQuery({
    queryKey: ['supplier-portal-data', previewSupplierId || (rolePreview ? 'role-preview' : 'self')],
    queryFn: async () => {
      const payload = previewSupplierId
        ? { supplier_id: previewSupplierId }
        : (rolePreview ? { preview_role: true } : {});
      const res = await base44.functions.invoke('supplierPortalData', payload);
      return res.data;
    },
    retry: false,
  });

  return query;
}